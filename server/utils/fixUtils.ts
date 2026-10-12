/**
 * Utility functions for normalizing and preparing safe database remediation SQL statements.
 */

export function prepareExecutableFix(
  rawSql: string,
  table: string = '',
  dbType: string = 'sqlite'
): { executableSql: string; isGovernance: boolean } {
  const cleanTable = (table || '').replace(/["`]/g, '').trim();

  const lines = (rawSql || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('--'));

  let cleanSql = lines.join('\n').trim();

  // If adding primary key via ALTER TABLE on SQLite
  // SQLite cannot add PRIMARY KEY or AUTOINCREMENT via ALTER TABLE ADD COLUMN.
  // The correct portable method in SQLite is adding an INTEGER column, filling with rowid, and creating a UNIQUE index.
  if (
    dbType === 'sqlite' &&
    (/ALTER\s+TABLE\s+["`]?([^"`\s]+)["`]?\s+ADD\s+COLUMN\s+["`]?([^"`\s]+)["`]?\s+INTEGER\s+PRIMARY/i.test(cleanSql) ||
     /ALTER\s+TABLE\s+["`]?([^"`\s]+)["`]?\s+ADD\s+COLUMN\s+["`]?id["`]?/i.test(cleanSql))
  ) {
    const match = cleanSql.match(/ALTER\s+TABLE\s+["`]?([^"`\s]+)["`]?\s+ADD\s+COLUMN\s+["`]?([^"`\s]+)["`]?/i);
    const targetTable = (match?.[1] || cleanTable || 'target').replace(/["`]/g, '');
    const colName = (match?.[2] || 'id').replace(/["`]/g, '');
    cleanSql = `ALTER TABLE "${targetTable}" ADD COLUMN "${colName}" INTEGER;
UPDATE "${targetTable}" SET "${colName}" = rowid WHERE "${colName}" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_${targetTable}_${colName}" ON "${targetTable}" ("${colName}");`;
  }

  // Handle pure SELECT queries (diagnostic/audit commands, not DDL mutations)
  if (/^\s*SELECT\b/i.test(cleanSql) && !/^\s*CREATE\b/i.test(cleanSql)) {
    if (cleanTable && /WHERE/i.test(cleanSql)) {
      cleanSql = `CREATE VIEW IF NOT EXISTS "v_${cleanTable}_verified" AS ${cleanSql.replace(/;\s*$/, '')};`;
    } else {
      return { executableSql: '', isGovernance: true };
    }
  }

  // Ensure CREATE INDEX statements include IF NOT EXISTS for idempotent execution
  if (/^CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/i.test(cleanSql)) {
    cleanSql = cleanSql.replace(/^CREATE\s+INDEX\s+/i, 'CREATE INDEX IF NOT EXISTS ');
  }

  // Ensure CREATE UNIQUE INDEX includes IF NOT EXISTS
  if (/^CREATE\s+UNIQUE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/i.test(cleanSql)) {
    cleanSql = cleanSql.replace(/^CREATE\s+UNIQUE\s+INDEX\s+/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ');
  }

  // Ensure CREATE TABLE includes IF NOT EXISTS
  if (/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i.test(cleanSql)) {
    cleanSql = cleanSql.replace(/^CREATE\s+TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ');
  }

  // Ensure CREATE VIEW includes IF NOT EXISTS
  if (/^CREATE\s+VIEW\s+(?!IF\s+NOT\s+EXISTS)/i.test(cleanSql)) {
    cleanSql = cleanSql.replace(/^CREATE\s+VIEW\s+/i, 'CREATE VIEW IF NOT EXISTS ');
  }

  const isGovernance = !cleanSql || cleanSql.length === 0;
  return { executableSql: cleanSql, isGovernance };
}

/**
 * Builds dialect-compliant SQL for recording policy/guidance approvals in _schema_governance.
 */
export function buildGovernanceSql(
  item: { id: string; findingId?: string; title: string; guidance?: string; description?: string; recommendation?: string; why?: string; proposedOperation?: string },
  user: string = 'admin',
  dbType: string = 'sqlite'
): string {
  const cleanTitle = (item.title || 'Architectural Policy').replace(/'/g, "''");
  const cleanGuidance = (item.guidance || item.description || item.recommendation || item.why || item.proposedOperation || 'Approved policy guidance').replace(/'/g, "''");
  const cleanUser = (user || 'admin').replace(/'/g, "''");
  const recId = (item.id || '').replace(/'/g, "''");
  const findingId = (item.findingId || item.id || '').replace(/'/g, "''");
  const now = new Date().toISOString();

  if (dbType === 'postgres' || dbType === 'postgresql') {
    return `CREATE TABLE IF NOT EXISTS _schema_governance (
  id SERIAL PRIMARY KEY,
  recommendation_id TEXT,
  finding_id TEXT,
  title TEXT,
  guidance TEXT,
  approved_by TEXT,
  approved_at TEXT,
  status TEXT
);
INSERT INTO _schema_governance (recommendation_id, finding_id, title, guidance, approved_by, approved_at, status)
VALUES ('${recId}', '${findingId}', '${cleanTitle}', '${cleanGuidance}', '${cleanUser}', '${now}', 'APPROVED');`;
  }

  if (dbType === 'mysql' || dbType === 'mariadb') {
    return `CREATE TABLE IF NOT EXISTS _schema_governance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recommendation_id VARCHAR(255),
  finding_id VARCHAR(255),
  title TEXT,
  guidance TEXT,
  approved_by VARCHAR(255),
  approved_at VARCHAR(100),
  status VARCHAR(50)
);
INSERT INTO _schema_governance (recommendation_id, finding_id, title, guidance, approved_by, approved_at, status)
VALUES ('${recId}', '${findingId}', '${cleanTitle}', '${cleanGuidance}', '${cleanUser}', '${now}', 'APPROVED');`;
  }

  if (dbType === 'duckdb') {
    return `CREATE TABLE IF NOT EXISTS _schema_governance (
  id BIGINT,
  recommendation_id VARCHAR,
  finding_id VARCHAR,
  title VARCHAR,
  guidance VARCHAR,
  approved_by VARCHAR,
  approved_at VARCHAR,
  status VARCHAR
);
INSERT INTO _schema_governance (recommendation_id, finding_id, title, guidance, approved_by, approved_at, status)
VALUES (1, '${recId}', '${findingId}', '${cleanTitle}', '${cleanGuidance}', '${cleanUser}', '${now}', 'APPROVED');`;
  }

  // SQLite and default
  return `CREATE TABLE IF NOT EXISTS _schema_governance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recommendation_id TEXT,
  finding_id TEXT,
  title TEXT,
  guidance TEXT,
  approved_by TEXT,
  approved_at TEXT,
  status TEXT
);
INSERT INTO _schema_governance (recommendation_id, finding_id, title, guidance, approved_by, approved_at, status)
VALUES ('${recId}', '${findingId}', '${cleanTitle}', '${cleanGuidance}', '${cleanUser}', '${now}', 'APPROVED');`;
}

/**
 * Splits a SQL script into individual statements safely without breaking on semicolons
 * inside string literals ('...', "...", `...`).
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const prevChar = i > 0 ? sql[i - 1] : '';

    if (char === "'" && !inDoubleQuote && !inBacktick) {
      if (!inSingleQuote) {
        inSingleQuote = true;
      } else if (sql[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      } else if (prevChar !== '\\') {
        inSingleQuote = false;
      }
    } else if (char === '"' && !inSingleQuote && !inBacktick) {
      if (!inDoubleQuote) inDoubleQuote = true;
      else if (prevChar !== '\\') inDoubleQuote = false;
    } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
      if (!inBacktick) inBacktick = true;
      else if (prevChar !== '\\') inBacktick = false;
    } else if (char === ';' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      const trimmed = current.trim();
      if (trimmed.length > 0 && !trimmed.startsWith('--')) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }
    current += char;
  }
  const trimmed = current.trim();
  if (trimmed.length > 0 && !trimmed.startsWith('--')) {
    statements.push(trimmed);
  }
  return statements;
}
