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
  'REINDEX',
  'MERGE',
  'UPSERT',
  'CALL',
  'LOAD_FILE',
  'INTO OUTFILE',
  'INTO DUMPFILE',
  'COPY',
  'LOCK',
  'UNLOCK',
  'SHUTDOWN'
];

/**
 * Strips comments from SQL while respecting single-quoted and double-quoted string literals.
 */
function stripCommentsAndLiterals(sql: string): { sanitizedSql: string; hasMultipleStatements: boolean } {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  const chars: string[] = [];
  const len = sql.length;
  let statementCount = 0;
  let lastNonWhitespaceChar = '';

  for (let i = 0; i < len; i++) {
    const c = sql[i];
    const next = i + 1 < len ? sql[i + 1] : '';

    if (inLineComment) {
      if (c === '\n' || c === '\r') {
        inLineComment = false;
        chars.push(' ');
      }
      continue;
    }

    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i++; // skip /
        chars.push(' ');
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      // Check for line comment start
      if (c === '-' && next === '-') {
        inLineComment = true;
        i++;
        continue;
      }
      // Check for block comment start
      if (c === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
      // Check for semicolon statement terminator
      if (c === ';') {
        statementCount++;
        chars.push(';');
        continue;
      }
    }

    // Toggle string quote states
    if (c === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote;
      chars.push(' '); // Replace string contents with space to prevent false keyword matches
      continue;
    }
    if (c === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
      chars.push(' ');
      continue;
    }
    if (c === '`' && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
      chars.push(' ');
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      chars.push(c);
      if (/\S/.test(c) && c !== ';') {
        lastNonWhitespaceChar = c;
      }
    } else {
      chars.push(' ');
    }
  }

  // Count statements cleanly: ignore trailing semicolon
  const statements = chars
    .join('')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);

  return {
    sanitizedSql: chars.join(''),
    hasMultipleStatements: statements.length > 1
  };
}

/**
 * Validates a SQL query for strictly safe read-only execution.
 * Enforces single-statement SELECT / WITH clauses and blocks any destructive keywords.
 */
export function validateReadOnlySQL(sql: string): SQLValidationResult {
  if (!sql || typeof sql !== 'string') {
    return { isSafe: false, isReadOnly: false, reason: 'Empty or invalid query input.' };
  }

  const { sanitizedSql, hasMultipleStatements } = stripCommentsAndLiterals(sql);

  if (hasMultipleStatements) {
    return {
      isSafe: false,
      isReadOnly: false,
      reason: 'Multiple SQL statements in a single execution are prohibited for security.'
    };
  }

  const trimmed = sanitizedSql.trim();
  if (!trimmed) {
    return { isSafe: false, isReadOnly: false, reason: 'Query contains no executable SQL statements.' };
  }

  const upperQuery = trimmed.toUpperCase();

  // Ensure query starts with SELECT, WITH, or EXPLAIN
  const isAllowedStart = upperQuery.startsWith('SELECT') ||
                         upperQuery.startsWith('WITH') ||
                         upperQuery.startsWith('EXPLAIN');

  if (!isAllowedStart) {
    return {
      isSafe: false,
      isReadOnly: false,
      reason: 'Only read-only SELECT queries (including WITH CTE clauses and EXPLAIN plans) are permitted.'
    };
  }

  // Scan for forbidden data-modifying / schema-modifying keywords anywhere in the structure
  for (const keyword of DESTRUCTIVE_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(upperQuery)) {
      return {
        isSafe: false,
        isReadOnly: false,
        reason: `Query contains prohibited modification command '${keyword}'.`,
        detectedCommand: keyword
      };
    }
  }

  // Check for SELECT ... INTO (e.g. INTO OUTFILE, INTO DUMPFILE, or SELECT ... INTO new_table)
  if (/\bSELECT\b[\s\S]+\bINTO\b/i.test(upperQuery)) {
    return {
      isSafe: false,
      isReadOnly: false,
      reason: 'SELECT ... INTO statements that write data or export files are prohibited in read-only mode.',
      detectedCommand: 'INTO'
    };
  }

  return {
    isSafe: true,
    isReadOnly: true
  };
}
