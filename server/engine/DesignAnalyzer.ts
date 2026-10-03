import { DatabaseSchema, Finding } from '../../src/types.js';

export class DesignAnalyzer {
  static analyze(schema: DatabaseSchema): Finding[] {
    const findings: Finding[] = [];
    let findingIdx = 1;

    for (const table of schema.tables) {
      // 1. Missing Primary Key Check
      if (table.primaryKey.length === 0 && table.type === 'table') {
        findings.push({
          id: `DES-NO-PK-${table.name}-${findingIdx++}`,
          title: `Table "${table.name}" Lacks a Primary Key`,
          category: 'structure',
          severity: 'CRITICAL',
          description: `Table "${table.name}" does not define any primary key constraint. Relational tables require unique record identification to maintain entity integrity.`,
          evidence: `Table primaryKey array is empty: []`,
          databaseObject: table.name,
          table: table.name,
          whyItMatters: 'Without a primary key, tables cannot be reliably indexed or uniquely referenced by foreign keys. ORMs, replication engines, and data deduplication tools fail or produce unpredictable duplicates.',
          recommendation: `Add a surrogate primary key (e.g. "id INTEGER PRIMARY KEY AUTOINCREMENT" or UUID) to "${table.name}".`,
          confidence: 100,
          risk: 'MEDIUM',
          expectedImpact: 'Guarantees entity uniqueness and allows foreign key reference integrity.',
          suggestedFix: `ALTER TABLE "${table.name}" ADD COLUMN id INTEGER PRIMARY KEY AUTOINCREMENT;`,
          rollbackSql: `-- Note: Dropping auto-increment PK in SQLite requires table re-creation`,
          status: 'OPEN',
          safeToApplyAuto: false
        });
      }

      // 2. First Normal Form (1NF) Violation: Multi-Valued Attributes
      for (const col of table.columns) {
        const colLower = col.name.toLowerCase();
        if (
          colLower === 'tags' ||
          colLower === 'categories' ||
          colLower.includes('list') ||
          colLower.includes('medication_list') ||
          colLower.includes('comma_separated')
        ) {
          findings.push({
            id: `DES-1NF-MULTI-${table.name}-${col.name}-${findingIdx++}`,
            title: `Potential 1NF Violation (Multi-Valued Attribute) in "${table.name}.${col.name}"`,
            category: 'structure',
            severity: 'MEDIUM',
            description: `The column "${col.name}" in "${table.name}" suggests non-atomic multi-valued items stored in a single field (e.g. comma-separated lists).`,
            evidence: `Column name pattern indicates multi-value list: "${col.name}"`,
            databaseObject: `${table.name}.${col.name}`,
            table: table.name,
            column: col.name,
            whyItMatters: '1NF requires all attribute values to be atomic. Storing comma-separated lists prevents exact indexing, forces costly wildcard searches (LIKE "%tag%"), and prevents relational constraints.',
            recommendation: `Normalize into a junction/associative table (e.g. "${table.name}_${col.name}") with a foreign key to "${table.name}".`,
            confidence: 85,
            risk: 'MEDIUM',
            expectedImpact: 'Enables exact index lookups, clean relational queries, and simplifies reporting.',
            suggestedFix: `-- Recommended Schema Normalization:
CREATE TABLE "${table.name}_${col.name}" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "${table.name}_id" INTEGER NOT NULL,
  value VARCHAR(100) NOT NULL,
  FOREIGN KEY ("${table.name}_id") REFERENCES "${table.name}"(id)
);`,
            status: 'OPEN',
            safeToApplyAuto: false
          });
        }
      }

      // 3. Second/Third Normal Form (2NF/3NF) Redundancy Check: Derived Columns
      const colNames = table.columns.map(c => c.name.toLowerCase());
      if (colNames.includes('subtotal') && colNames.includes('quantity') && colNames.includes('unit_price')) {
        findings.push({
          id: `DES-3NF-DERIVED-${table.name}-subtotal-${findingIdx++}`,
          title: `Derived / Redundant Column "subtotal" in "${table.name}"`,
          category: 'structure',
          severity: 'LOW',
          description: `The column "subtotal" in "${table.name}" appears to be a computed product of "quantity" * "unit_price". Storing calculated fields creates data inconsistency risks if one component updates without the other.`,
          evidence: `Table contains redundant calculation set: (quantity, unit_price, subtotal)`,
          databaseObject: `${table.name}.subtotal`,
          table: table.name,
          column: 'subtotal',
          whyItMatters: 'If unit_price or quantity is updated in an existing row and subtotal is not synchronously recalulated, the database contains invalid mathematical records.',
          recommendation: 'Replace physical subtotal column with a generated virtual column or calculate dynamically in SELECT queries/views.',
          confidence: 90,
          risk: 'LOW',
          expectedImpact: 'Eliminates synchronization anomalies between prices and totals.',
          suggestedFix: `CREATE VIEW IF NOT EXISTS "v_${table.name}_with_totals" AS SELECT *, (quantity * unit_price) AS subtotal FROM "${table.name}";`,
          status: 'OPEN',
          safeToApplyAuto: true
        });
      }

      // 4. Inferred / Missing Foreign Keys
      for (const col of table.columns) {
        const colLower = col.name.toLowerCase();
        if (colLower.endsWith('_id') || (colLower.endsWith('id') && colLower.length > 2)) {
          // Check if it already has an explicit foreign key
          const isExplicitFk = table.foreignKeys.some(fk => fk.columnName === col.name);
          if (!isExplicitFk && !col.isPrimaryKey) {
            // Find candidate parent table
            const candidateEntity = colLower.replace(/_id$/, '').replace(/id$/, '');
            const matchingTable = schema.tables.find(
              t => t.name.toLowerCase() === candidateEntity ||
                   t.name.toLowerCase() === `${candidateEntity}s` ||
                   t.name.toLowerCase() === `${candidateEntity}es`
            );

            if (matchingTable && matchingTable.name !== table.name) {
              const confidence = matchingTable.primaryKey.length > 0 ? 88 : 72;
              findings.push({
                id: `DES-INFERRED-FK-${table.name}-${col.name}-${findingIdx++}`,
                title: `Inferred Relationship: "${table.name}.${col.name}" → "${matchingTable.name}"`,
                category: 'relationships',
                severity: 'MEDIUM',
                description: `Column "${col.name}" matches naming conventions for a reference to "${matchingTable.name}", but has NO formal FOREIGN KEY constraint enforced at the database level.`,
                evidence: `Matching column "${col.name}" (${col.dataType}) correlates with target table "${matchingTable.name}" (PK: ${matchingTable.primaryKey.join(', ') || 'id'})`,
                databaseObject: `${table.name}.${col.name}`,
                table: table.name,
                column: col.name,
                whyItMatters: 'Without an explicit FOREIGN KEY constraint, the database engine cannot prevent orphaned records if a parent row is deleted or modified. Referential integrity depends solely on application code correctness.',
                recommendation: `Add a formal FOREIGN KEY constraint: "${table.name}.${col.name}" REFERENCES "${matchingTable.name}"("${matchingTable.primaryKey[0] || 'id'}").`,
                confidence,
                risk: 'LOW',
                expectedImpact: 'Guarantees referential integrity and prevents orphaned child records.',
                suggestedFix: `CREATE INDEX IF NOT EXISTS "idx_${table.name}_${col.name}_fk" ON "${table.name}" ("${col.name}");`,
                status: 'OPEN',
                safeToApplyAuto: true
              });
            }
          }
        }
      }
    }

    return findings;
  }
}
