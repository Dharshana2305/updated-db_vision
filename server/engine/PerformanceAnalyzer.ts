import { DatabaseSchema, Finding } from '../../src/types.js';

export class PerformanceAnalyzer {
  static analyze(schema: DatabaseSchema): Finding[] {
    const findings: Finding[] = [];
    let findingIdx = 1;

    for (const table of schema.tables) {
      // 1. Missing Indexes on Foreign Key Columns
      for (const fk of table.foreignKeys) {
        // Check if any existing index covers this column as its leading column
        const hasCoveringIndex = table.indexes.some(idx => idx.columns.length > 0 && idx.columns[0] === fk.columnName);

        if (!hasCoveringIndex) {
          const indexName = `idx_${table.name}_${fk.columnName}`.toLowerCase();
          const createIndexSql = `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table.name}" ("${fk.columnName}");`;
          const dropIndexSql = `DROP INDEX IF EXISTS "${indexName}";`;

          findings.push({
            id: `PERF-FK-IDX-${table.name}-${fk.columnName}`,
            title: `Missing Index on Foreign Key "${table.name}.${fk.columnName}"`,
            category: 'performance',
            severity: 'HIGH',
            description: `Foreign key column "${fk.columnName}" in table "${table.name}" references "${fk.referencedTable}.${fk.referencedColumn}" but has no supporting index. Joining or filtering by this key will cause sequential table scans.`,
            evidence: `Table "${table.name}" contains foreign key on "${fk.columnName}" without an index.`,
            databaseObject: `${table.name}.${fk.columnName}`,
            table: table.name,
            column: fk.columnName,
            whyItMatters: 'Foreign keys are heavily traversed in JOIN operations and parent row DELETES/UPDATES. Without an index, SQLite/PostgreSQL/MySQL must scan every row of the child table, creating CPU spikes and row lock contention as the table grows.',
            recommendation: `Add a B-Tree index on "${table.name}" ("${fk.columnName}").`,
            confidence: 99,
            risk: 'LOW',
            expectedImpact: 'Improves JOIN and foreign key lookup query speeds by 10x to 100x on medium-to-large datasets.',
            suggestedFix: createIndexSql,
            rollbackSql: dropIndexSql,
            status: 'OPEN',
            safeToApplyAuto: true
          });
        }
      }

      // 2. Duplicate or Redundant Indexes
      const seenIndexSignatures = new Map<string, string>();
      for (const idx of table.indexes) {
        const sig = idx.columns.join(',');
        if (seenIndexSignatures.has(sig)) {
          const duplicateOf = seenIndexSignatures.get(sig)!;
          findings.push({
            id: `PERF-DUP-IDX-${table.name}-${idx.name}`,
            title: `Duplicate Index "${idx.name}" in "${table.name}"`,
            category: 'performance',
            severity: 'MEDIUM',
            description: `Index "${idx.name}" indexes the exact same columns (${sig}) as index "${duplicateOf}".`,
            evidence: `Both "${idx.name}" and "${duplicateOf}" index columns: (${sig})`,
            databaseObject: `${table.name}.${idx.name}`,
            table: table.name,
            whyItMatters: 'Every additional index requires disk storage and slows down INSERT, UPDATE, and DELETE write throughput as all indexes must be synchronously updated.',
            recommendation: `Drop redundant index "${idx.name}".`,
            confidence: 95,
            risk: 'LOW',
            expectedImpact: 'Recovers disk space and improves write throughput for table modifications.',
            suggestedFix: `DROP INDEX IF EXISTS "${idx.name}";`,
            rollbackSql: `CREATE INDEX IF NOT EXISTS "${idx.name}" ON "${table.name}" (${idx.columns.map(c => `"${c}"`).join(', ')});`,
            status: 'OPEN',
            safeToApplyAuto: true
          });
        } else {
          seenIndexSignatures.set(sig, idx.name);
        }
      }

      // 3. Wide Table / Unbounded TEXT in High-Volume Table
      const textColumns = table.columns.filter(c => c.dataType === 'TEXT' || c.dataType.includes('VARCHAR(MAX)'));
      if (textColumns.length >= 3 && table.rowCount > 500) {
        findings.push({
          id: `PERF-WIDE-TXT-${table.name}`,
          title: `Multiple Heavy TEXT Columns in Table "${table.name}"`,
          category: 'performance',
          severity: 'LOW',
          description: `Table "${table.name}" has ${textColumns.length} large TEXT/BLOB columns (${textColumns.map(c => c.name).join(', ')}). Storing extensive unconstrained text inline inflates row size.`,
          evidence: `TEXT columns: ${textColumns.map(c => c.name).join(', ')}`,
          databaseObject: table.name,
          table: table.name,
          whyItMatters: 'Large row sizes reduce the number of rows fitting on a single storage page in the buffer pool, increasing disk I/O during table scans.',
          recommendation: 'Consider offloading rarely accessed text columns to a separate detail table or compressed document storage.',
          confidence: 80,
          risk: 'LOW',
          expectedImpact: 'Reduces database memory footprint and increases buffer cache hit rates.',
          suggestedFix: `-- Consider splitting into "${table.name}" and "${table.name}_details"`,
          status: 'OPEN',
          safeToApplyAuto: false
        });
      }
    }

    return findings;
  }
}
