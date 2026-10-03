export interface SQLValidationResult {
  isSafe: boolean;
  isReadOnly: boolean;
  reason?: string;
  detectedCommand?: string;
}

const DESTRUCTIVE_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'REPLACE',
  'GRANT',
  'REVOKE',
  'ATTACH',
  'DETACH',
  'PRAGMA',
  'EXEC',
  'EXECUTE',
  'VACUUM',
  'REINDEX'
];

/**
 * Validates a SQL query for safe read-only execution.
 */
export function validateReadOnlySQL(sql: string): SQLValidationResult {
  if (!sql || typeof sql !== 'string') {
    return { isSafe: false, isReadOnly: false, reason: 'Empty or invalid query input.' };
  }

  // Remove single line comments (-- ...) and block comments (/* ... */)
  const cleaned = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  if (!cleaned) {
    return { isSafe: false, isReadOnly: false, reason: 'Query contains no executable SQL statements.' };
  }

  // Check for multiple semicolon-separated statements (prevent SQL injection chaining)
  const statements = cleaned.split(';').map(s => s.trim()).filter(Boolean);
  if (statements.length > 1) {
    return {
      isSafe: false,
      isReadOnly: false,
      reason: 'Multiple SQL statements in a single execution are prohibited for security.'
    };
  }

  const upperQuery = cleaned.toUpperCase();

  // Ensure query starts with SELECT or WITH
  const startsWithSelect = upperQuery.startsWith('SELECT') || upperQuery.startsWith('WITH');
  if (!startsWithSelect) {
    return {
      isSafe: false,
      isReadOnly: false,
      reason: 'Only SELECT queries (including WITH CTE clauses) are allowed in read-only mode.'
    };
  }

  // Scan tokens for forbidden data-modifying / schema-modifying keywords
  const tokens = upperQuery.split(/\s+/);
  for (const keyword of DESTRUCTIVE_KEYWORDS) {
    // Search for whole word keyword match (e.g. "INTO", "DELETE FROM", "DROP TABLE", "UPDATE")
    // Match word boundary to avoid false positives (e.g. column named "update_date")
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(cleaned)) {
      // Allow WITH ... AS (SELECT ...)
      // But reject if keyword appears as a standalone command statement outside of identifiers
      const isSubqueryKeyword = (keyword === 'CREATE' || keyword === 'REPLACE' || keyword === 'DROP' || keyword === 'ALTER' || keyword === 'DELETE' || keyword === 'UPDATE' || keyword === 'TRUNCATE');
      if (isSubqueryKeyword) {
        return {
          isSafe: false,
          isReadOnly: false,
          reason: `Query contains prohibited modification keyword '${keyword}'.`,
          detectedCommand: keyword
        };
      }
    }
  }

  return {
    isSafe: true,
    isReadOnly: true
  };
}
