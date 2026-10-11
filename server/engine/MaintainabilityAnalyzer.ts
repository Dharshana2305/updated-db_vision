import { DatabaseSchema, Finding } from '../../src/types.js';

export class MaintainabilityAnalyzer {
  static analyze(schema: DatabaseSchema): Finding[] {
    const findings: Finding[] = [];
    let findingIdx = 1;

    let hasSnakeCase = false;
    let hasCamelCase = false;

    for (const table of schema.tables) {
      for (const col of table.columns) {
        if (col.name.includes('_')) hasSnakeCase = true;
        if (/[a-z][A-Z]/.test(col.name)) hasCamelCase = true;

        // Check for cryptic single-character column names
        if (col.name.length === 1 && !col.isPrimaryKey) {
          findings.push({
            id: `MAINT-CRYPTIC-${table.name}-${col.name}`,
            title: `Cryptic Column Name "${col.name}" in Table "${table.name}"`,
            category: 'maintainability',
            severity: 'LOW',
            description: `Single character or ambiguous identifier "${col.name}" impairs readability and schema understanding for developers.`,
            evidence: `Column name length = 1: "${col.name}"`,
            databaseObject: `${table.name}.${col.name}`,
            table: table.name,
            column: col.name,
            whyItMatters: 'Ambiguous column names create cognitive friction, increase onboarding time, and lead to mistakes during manual SQL queries.',
            recommendation: `Rename column to a descriptive, self-explanatory English noun phrase.`,
            confidence: 95,
            risk: 'LOW',
            expectedImpact: 'Improves schema clarity and developer velocity.',
            suggestedFix: `CREATE VIEW IF NOT EXISTS "v_${table.name}_readable" AS SELECT "${col.name}" AS "${col.name}_value", * FROM "${table.name}";`,
            status: 'OPEN',
            safeToApplyAuto: true
          });
        }
      }
    }

    // Flag mixed naming conventions across the schema
    if (hasSnakeCase && hasCamelCase) {
      findings.push({
        id: `MAINT-MIXED-CASING`,
        title: 'Mixed Naming Conventions (snake_case and camelCase) in Schema',
        category: 'maintainability',
        severity: 'LOW',
        description: 'The database uses conflicting naming conventions across tables and columns, mixing snake_case (e.g. user_id) with camelCase (e.g. createdAt).',
        evidence: 'Both snake_case and camelCase patterns detected in column schema declarations.',
        databaseObject: schema.databaseName,
        table: schema.tables[0]?.name || 'schema',
        whyItMatters: 'Inconsistent naming conventions cause developers and ORMs to introduce subtle typos and mapping errors.',
        recommendation: 'Adopt a uniform standard (recommended: snake_case for PostgreSQL/SQLite/MySQL) across all entities.',
        confidence: 90,
        risk: 'LOW',
        expectedImpact: 'Uniform developer experience and consistent automated code generation.',
        suggestedFix: `CREATE TABLE IF NOT EXISTS _schema_conventions (id INTEGER PRIMARY KEY, standard TEXT, updated_at TEXT);
INSERT OR REPLACE INTO _schema_conventions VALUES (1, 'snake_case', datetime('now'));`,
        status: 'OPEN',
        safeToApplyAuto: true
      });
    }

    return findings;
  }
}
