import { SQLAnalysisResult, FindingSeverity, DatabaseSchema } from '../../src/types.js';

export class SQLOptimizer {
  static analyze(sql: string, schema?: DatabaseSchema): SQLAnalysisResult {
    const trimmed = sql.trim();
    const upper = trimmed.toUpperCase();
    const issues: SQLAnalysisResult['issues'] = [];

    // 1. Check Read-Only vs Destructive
    const isDestructive =
      upper.startsWith('DROP ') ||
      upper.startsWith('DELETE ') ||
      upper.startsWith('TRUNCATE ') ||
      upper.startsWith('ALTER ') ||
      upper.startsWith('UPDATE ') ||
      upper.startsWith('INSERT ');
    const isReadOnly = !isDestructive;

    // 2. SQL Injection Patterns
    if (/(--|\/\*|\*\/|;|UNION\s+SELECT|OR\s+1\s*=\s*1|OR\s+'1'\s*=\s*'1')/i.test(trimmed) && trimmed.includes("'")) {
      issues.push({
        type: 'SECURITY_INJECTION_RISK',
        severity: 'CRITICAL',
        message: 'Potential SQL injection vulnerability pattern detected (e.g. inline tautology OR 1=1 or unparameterized concatenation). Always use parameterized prepared statements (?, $1).'
      });
    }

    // 3. SELECT * Anti-Pattern
    if (/SELECT\s+\*\s+FROM/i.test(trimmed)) {
      issues.push({
        type: 'PERFORMANCE_SELECT_ALL',
        severity: 'MEDIUM',
        message: 'Anti-pattern "SELECT *": Retrieves unnecessary columns and large text attributes, defeating covering indexes and inflating network payload.'
      });
    }

    // 4. Missing LIMIT / Pagination Clause
    if (upper.startsWith('SELECT') && !upper.includes('LIMIT') && !upper.includes('TOP ') && !upper.includes('FETCH FIRST')) {
      issues.push({
        type: 'PERFORMANCE_UNBOUNDED_RESULT',
        severity: 'LOW',
        message: 'Query lacks a LIMIT / pagination clause. Could unexpectedly pull millions of rows into application memory.'
      });
    }

    // 5. Leading Wildcard LIKE '%text' (Non-sargable predicate)
    if (/LIKE\s+['"]%[^'"]+['"]/i.test(trimmed)) {
      issues.push({
        type: 'PERFORMANCE_NON_SARGABLE_LIKE',
        severity: 'HIGH',
        message: 'Leading wildcard predicate (LIKE "%value%"): Bypasses B-tree indexes entirely and forces a full table scan.'
      });
    }

    // 6. Multiple Cartesian Join / Comma JOIN
    if (/FROM\s+[a-zA-Z0-9_]+\s*,\s*[a-zA-Z0-9_]+/i.test(trimmed)) {
      issues.push({
        type: 'STRUCTURE_CARTESIAN_JOIN',
        severity: 'HIGH',
        message: 'Implicit comma cross-join detected. Explicit ANSI JOIN syntax (INNER JOIN ... ON ...) should be used to prevent accidental cartesian products.'
      });
    }

    // 7. Generate Optimized SQL
    let optimizedSql = trimmed;
    let explanation = 'No significant optimizations were required.';
    let estimatedImpact = 'Neutral impact.';

    if (/SELECT\s+\*\s+FROM/i.test(optimizedSql)) {
      optimizedSql = optimizedSql.replace(/SELECT\s+\*\s+FROM/i, 'SELECT id, created_at, status FROM');
      explanation = 'Replaced wildcard SELECT * with explicit projection columns and appended safety LIMIT clause.';
      estimatedImpact = 'Reduces network egress bandwidth by ~40-70% and enables index-only scans.';
    }

    if (!upper.includes('LIMIT') && upper.startsWith('SELECT')) {
      optimizedSql = `${optimizedSql.replace(/;?\s*$/, '')} LIMIT 50;`;
      explanation += ' Added defensive LIMIT 50 constraint.';
    }

    const safetyRisk = isDestructive ? 'DESTRUCTIVE' : issues.some(i => i.severity === 'HIGH' || i.severity === 'CRITICAL') ? 'POTENTIALLY_SLOW' : 'SAFE';

    return {
      originalSql: sql,
      optimizedSql,
      isReadOnly,
      issues,
      explanation,
      estimatedImpact,
      safetyRisk
    };
  }
}
