import { DatabaseSchema, Finding } from '../../src/types.js';

export class QualityAnalyzer {
  static analyze(
    schema: DatabaseSchema,
    tableProfiles: Record<string, { nullCounts: Record<string, number>; distinctCounts: Record<string, number>; sampleRows: Record<string, any>[]; totalRows: number }>
  ): Finding[] {
    const findings: Finding[] = [];
    let findingIdx = 1;

    for (const table of schema.tables) {
      const profile = tableProfiles[table.name];
      if (!profile || profile.totalRows === 0) continue;

      const totalRows = profile.totalRows;

      // 1. High NULL Percentage Check (> 40% NULL)
      for (const [colName, nullCount] of Object.entries(profile.nullCounts)) {
        const nullPct = Math.round((nullCount / totalRows) * 100);
        if (nullPct >= 40 && totalRows >= 5) {
          findings.push({
            id: `QUAL-NULL-${table.name}-${colName}-${findingIdx++}`,
            title: `High NULL Rate (${nullPct}%) in "${table.name}.${colName}"`,
            category: 'quality',
            severity: nullPct >= 70 ? 'MEDIUM' : 'LOW',
            description: `Column "${colName}" in table "${table.name}" has ${nullCount} of ${totalRows} rows containing NULL values (${nullPct}% empty).`,
            evidence: `NULL count: ${nullCount} / ${totalRows} rows (${nullPct}%)`,
            databaseObject: `${table.name}.${colName}`,
            table: table.name,
            column: colName,
            whyItMatters: 'Extremely sparse columns waste storage and can complicate queries requiring COALESCE or IS NOT NULL guards. Often indicates an optional feature that should be modeled in a separate table or attribute map.',
            recommendation: 'Evaluate whether this attribute is truly essential for all rows or should be extracted to a separate extension table.',
            confidence: 95,
            risk: 'LOW',
            expectedImpact: 'Improves table density and avoids sparse column overhead.',
            suggestedFix: `-- Check rows with values:
SELECT COUNT(*) FROM "${table.name}" WHERE "${colName}" IS NOT NULL;`,
            status: 'OPEN',
            safeToApplyAuto: false
          });
        }
      }

      // 2. Email Format Validation on Sample Rows
      const emailCol = table.columns.find(c => c.name.toLowerCase().includes('email'));
      if (emailCol && profile.sampleRows.length > 0) {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const invalidEmails: string[] = [];

        for (const row of profile.sampleRows) {
          const val = row[emailCol.name];
          if (val && typeof val === 'string' && !emailRegex.test(val)) {
            invalidEmails.push(val);
          }
        }

        if (invalidEmails.length > 0) {
          findings.push({
            id: `QUAL-EMAIL-REGEX-${table.name}-${emailCol.name}-${findingIdx++}`,
            title: `Malformed Email Address Values in "${table.name}.${emailCol.name}"`,
            category: 'quality',
            severity: 'HIGH',
            description: `Data sampling identified ${invalidEmails.length} record(s) with syntactically invalid email addresses in "${table.name}.${emailCol.name}".`,
            evidence: `Sample malformed values: ${invalidEmails.slice(0, 3).map(e => `"${e}"`).join(', ')}`,
            databaseObject: `${table.name}.${emailCol.name}`,
            table: table.name,
            column: emailCol.name,
            whyItMatters: 'Invalid emails cause failed transaction receipts, undelivered user notifications, and security risks if malicious inputs bypass application validation.',
            recommendation: `Add a CHECK constraint or database validation trigger ensuring email contains valid '@' and domain parts. Clean existing records.`,
            confidence: 100,
            risk: 'MEDIUM',
            expectedImpact: 'Guarantees reliable user communication and clean customer master records.',
            suggestedFix: `CREATE VIEW IF NOT EXISTS "v_${table.name}_valid_emails" AS SELECT * FROM "${table.name}" WHERE "${emailCol.name}" LIKE '%@%.%';`,
            status: 'OPEN',
            safeToApplyAuto: true
          });
        }
      }

      // 3. Phone Format Inconsistency Check
      const phoneCol = table.columns.find(c => c.name.toLowerCase().includes('phone') || c.name.toLowerCase().includes('mobile'));
      if (phoneCol && profile.sampleRows.length > 2) {
        const phoneFormats: string[] = [];
        for (const row of profile.sampleRows) {
          const val = row[phoneCol.name];
          if (val && typeof val === 'string') {
            if (val.startsWith('+')) phoneFormats.push('E.164 (international)');
            else if (val.includes('-')) phoneFormats.push('Dashed local');
            else if (/^\d+$/.test(val)) phoneFormats.push('Raw digits');
          }
        }

        const uniqueFormats = Array.from(new Set(phoneFormats));
        if (uniqueFormats.length > 1) {
          findings.push({
            id: `QUAL-PHONE-FMT-${table.name}-${phoneCol.name}-${findingIdx++}`,
            title: `Inconsistent Phone Number Formats in "${table.name}.${phoneCol.name}"`,
            category: 'quality',
            severity: 'LOW',
            description: `Phone numbers are stored in conflicting notations: ${uniqueFormats.join(', ')}.`,
            evidence: `Found multiple formats (${uniqueFormats.join(', ')}) in table sample.`,
            databaseObject: `${table.name}.${phoneCol.name}`,
            table: table.name,
            column: phoneCol.name,
            whyItMatters: 'Lack of canonical formatting (e.g. E.164 +1234567890) breaks SMS dispatch gateways, telephony dialers, and complicates deduplication.',
            recommendation: 'Standardize phone numbers to E.164 international standard format before inserting.',
            confidence: 88,
            risk: 'LOW',
            expectedImpact: 'Enables dependable SMS gateway delivery and accurate entity deduplication.',
            suggestedFix: `CREATE TABLE IF NOT EXISTS _phone_standards (table_name TEXT, col_name TEXT, standard TEXT, updated_at TEXT);
INSERT OR REPLACE INTO _phone_standards VALUES ('${table.name}', '${phoneCol.name}', 'E.164', datetime('now'));`,
            status: 'OPEN',
            safeToApplyAuto: true
          });
        }
      }
    }

    return findings;
  }
}
