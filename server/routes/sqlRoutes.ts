import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { AuthenticatedRequest, authenticate, requireProjectOwner } from '../middleware/auth.js';
import { AdapterFactory } from '../adapters/AdapterFactory.js';
import { SQLOptimizer } from '../ai/SQLOptimizer.js';
import { validateReadOnlySQL } from '../utils/sqlSecurity.js';

const router = Router();

// Analyze SQL
router.post('/projects/:id/sql/analyze', authenticate, requireProjectOwner, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { sql } = req.body;
  if (!sql) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'SQL string is required.' } });
    return;
  }

  const adapter = AdapterFactory.getActiveAdapter(req.params.id);
  let schema;
  if (adapter) {
    try {
      schema = await adapter.extractSchema();
    } catch {
      // ignore
    }
  }

  const analysis = SQLOptimizer.analyze(sql, schema);
  res.json({ success: true, analysis });
});

// Execute approved read-only query
router.post('/projects/:id/sql/execute', authenticate, requireProjectOwner, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  const { sql, maxRows = 100 } = req.body;

  if (!sql) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'SQL query is required.' } });
    return;
  }

  // Step 8: Strict SQL security validation
  const validation = validateReadOnlySQL(sql);
  if (!validation.isSafe) {
    res.status(400).json({
      success: false,
      error: { code: 'SECURITY_BLOCKED', message: `Execution rejected: ${validation.reason}` }
    });
    return;
  }

  const adapter = AdapterFactory.getActiveAdapter(projectId);
  if (!adapter) {
    res.status(400).json({ success: false, error: { code: 'NO_CONNECTION', message: 'Database is not connected.' } });
    return;
  }

  try {
    const result = await adapter.executeQuery(sql, { maxRows: Number(maxRows) });

    store.addAuditLog({
      id: `LOG-${Date.now()}`,
      projectId,
      userId: req.user!.id,
      action: 'QUERY_EXECUTED',
      targetObject: 'Read-Only Query',
      details: `Executed read-only SQL: ${sql.slice(0, 100)}... returned ${result.rowCount} rows in ${result.executionTimeMs}ms`,
      sqlExecuted: sql,
      result: 'SUCCESS',
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'QUERY_FAILED', message: err.message || 'Query execution failed' } });
  }
});

// Benchmark query
router.post('/projects/:id/sql/benchmark', authenticate, requireProjectOwner, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  const { sql, optimizedSql } = req.body;

  if (!sql) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'SQL is required.' } });
    return;
  }

  // Enforce read-only validation on original SQL
  const originalValidation = validateReadOnlySQL(sql);
  if (!originalValidation.isSafe) {
    res.status(400).json({
      success: false,
      error: { code: 'SECURITY_BLOCKED', message: `Original query rejected: ${originalValidation.reason}` }
    });
    return;
  }

  // Enforce read-only validation on optimized SQL if provided
  if (optimizedSql) {
    const optValidation = validateReadOnlySQL(optimizedSql);
    if (!optValidation.isSafe) {
      res.status(400).json({
        success: false,
        error: { code: 'SECURITY_BLOCKED', message: `Optimized query rejected: ${optValidation.reason}` }
      });
      return;
    }
  }

  const adapter = AdapterFactory.getActiveAdapter(projectId);
  if (!adapter || !adapter.benchmarkQuery) {
    res.status(400).json({ success: false, error: { code: 'UNSUPPORTED', message: 'Query benchmark is not supported by current adapter or database is disconnected.' } });
    return;
  }

  try {
    const originalBench = await adapter.benchmarkQuery(sql, 3);
    let optimizedBench;
    let improvementPct = 0;

    if (optimizedSql) {
      try {
        optimizedBench = await adapter.benchmarkQuery(optimizedSql, 3);
        if (originalBench.averageExecutionMs > 0) {
          improvementPct = Math.round(((originalBench.averageExecutionMs - optimizedBench.averageExecutionMs) / originalBench.averageExecutionMs) * 100);
        }
      } catch (err: any) {
        console.warn('Optimized benchmark error:', err);
      }
    }

    res.json({
      success: true,
      original: originalBench,
      optimized: optimizedBench,
      improvementPct: Math.max(0, improvementPct)
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'BENCHMARK_FAILED', message: err.message || 'Benchmarking failed' } });
  }
});

export default router;
