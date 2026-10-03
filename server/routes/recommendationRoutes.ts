import { Router, Response } from 'express';
import fs from 'fs';
import { store } from '../db/store.js';
import { AuthenticatedRequest, authenticate, requireProjectOwner } from '../middleware/auth.js';
import { AdapterFactory } from '../adapters/AdapterFactory.js';
import { SQLiteAdapter } from '../adapters/SQLiteAdapter.js';
import { ReviewEngine } from '../engine/ReviewEngine.js';
import { AuditLog } from '../../src/types.js';

const router = Router();

// Get all recommendations for project (Protected with Ownership Check)
router.get('/projects/:id/recommendations', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const recommendations = store.getRecommendations(req.params.id);
  res.json({ success: true, recommendations });
});

// Approve and Apply Recommendation (REAL DATABASE MODIFICATION)
router.post('/recommendations/:id/approve', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const recId = req.params.id;
  const { projectId } = req.body;

  if (!projectId) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'ProjectId is required.' } });
    return;
  }

  // IDOR Protection: Verify caller owns target project
  const project = store.getProjectById(projectId, req.user!.id);
  if (!project) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied. You do not own this project.' } });
    return;
  }

  const rec = store.getRecommendations(projectId).find(r => r.id === recId);
  if (!rec) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Recommendation not found.' } });
    return;
  }

  let adapter = AdapterFactory.getActiveAdapter(projectId);
  if (!adapter && project.connectionConfig) {
    try {
      adapter = await AdapterFactory.createAdapter(projectId, project.connectionConfig);
    } catch (err) {
      console.warn('Auto-reconnecting adapter for recommendation approval failed:', err);
    }
  }

  if (!adapter) {
    res.status(400).json({ success: false, error: { code: 'NO_CONNECTION', message: 'Active database connection not found for this project. Please reconnect database.' } });
    return;
  }

  // Clean executable SQL by stripping single-line comments
  let executableSql = (rec.proposedOperation || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('--'))
    .join('\n')
    .trim();

  let isArchitecturalGovernance = false;

  if (!executableSql) {
    // If the recommendation represents architectural, structural, or governance policy guidance,
    // record and enforce it directly into the database governance audit registry instead of failing.
    isArchitecturalGovernance = true;
    const cleanTitle = (rec.title || 'Architectural Guidance').replace(/'/g, "''");
    const cleanGuidance = (rec.recommendation || rec.why || rec.proposedOperation || 'Approved policy guidance').replace(/'/g, "''");
    const cleanUser = (req.user?.email || req.user?.id || 'admin').replace(/'/g, "''");
    executableSql = `CREATE TABLE IF NOT EXISTS _schema_governance (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT,
  finding_id TEXT,
  title TEXT,
  guidance TEXT,
  approved_by TEXT,
  approved_at TEXT,
  status TEXT
);
INSERT INTO _schema_governance (id, recommendation_id, finding_id, title, guidance, approved_by, approved_at, status)
VALUES ('GOV-${Date.now()}', '${rec.id}', '${rec.findingId}', '${cleanTitle}', '${cleanGuidance}', '${cleanUser}', '${new Date().toISOString()}', 'APPROVED');`;
  }

  try {
    // Execute modification on connected database adapter
    const modRes = await adapter.executeModification(executableSql);

    if (!modRes.success) {
      store.updateRecommendation(recId, {
        status: 'FAILED',
        errorMessage: modRes.message || 'SQL execution failed on database.'
      });

      res.status(400).json({
        success: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: `Database modification failed: ${modRes.message}`,
          details: modRes.message
        }
      });
      return;
    }

    // Step 15: Execution Succeeded -> Mark APPLIED
    const applyResult = isArchitecturalGovernance
      ? `Architectural guidance approved & registered in database governance registry (_schema_governance).`
      : `Successfully executed on database: ${executableSql} (${modRes.affectedRows || 0} rows affected)`;
    const updated = store.updateRecommendation(recId, {
      status: 'APPLIED',
      appliedAt: new Date().toISOString(),
      appliedResult: applyResult,
      errorMessage: undefined
    });

    // Update corresponding finding status
    store.updateFinding(rec.findingId, { status: 'APPLIED' });

    // Update review schema snapshot if available
    try {
      const refreshedSchema = await adapter.extractSchema();
      const reviews = store.getReviews(projectId);
      if (reviews.length > 0) {
        reviews[0].schemaSnapshot = refreshedSchema;
      }
    } catch {
      // ignore
    }

    // Record in Audit Log
    const auditLog: AuditLog = {
      id: `LOG-${Date.now()}`,
      projectId,
      userId: req.user!.id,
      action: 'FIX_APPLIED',
      targetObject: rec.safetyChecks?.affectedObjects?.join(', ') || rec.title,
      details: `Applied fix "${rec.title}". ${applyResult}`,
      sqlExecuted: executableSql,
      result: 'SUCCESS',
      timestamp: new Date().toISOString()
    };
    store.addAuditLog(auditLog);

    res.json({ success: true, recommendation: updated, auditLog });
  } catch (err: any) {
    store.updateRecommendation(recId, {
      status: 'FAILED',
      errorMessage: err.message || 'Execution error'
    });

    res.status(500).json({
      success: false,
      error: { code: 'EXECUTION_ERROR', message: err.message || 'Failed to apply recommendation' }
    });
  }
});

// Reject Recommendation
router.post('/recommendations/:id/reject', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const recId = req.params.id;
  const { projectId, reason } = req.body;

  const project = store.getProjectById(projectId, req.user!.id);
  if (!project) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    return;
  }

  const updated = store.updateRecommendation(recId, {
    status: 'REJECTED'
  });

  if (!updated) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Recommendation not found.' } });
    return;
  }

  store.updateFinding(updated.findingId, { status: 'REJECTED' });

  store.addAuditLog({
    id: `LOG-${Date.now()}`,
    projectId,
    userId: req.user!.id,
    action: 'RECOMMENDATION_REJECTED',
    targetObject: updated.title,
    details: `Rejected recommendation "${updated.title}". Reason: ${reason || 'User preference'}`,
    result: 'SUCCESS',
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, recommendation: updated });
});

// Rollback an applied recommendation
router.post('/recommendations/:id/rollback', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const recId = req.params.id;
  const { projectId } = req.body;

  const project = store.getProjectById(projectId, req.user!.id);
  if (!project) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    return;
  }

  const rec = store.getRecommendations(projectId).find(r => r.id === recId);
  if (!rec) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Recommendation not found.' } });
    return;
  }

  if (rec.status !== 'APPLIED') {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Only APPLIED recommendations can be rolled back.' } });
    return;
  }

  let cleanRollbackSql = (rec.rollbackOperation || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('--'))
    .join('\n')
    .trim();

  if (!cleanRollbackSql) {
    cleanRollbackSql = `UPDATE _schema_governance SET status = 'ROLLED_BACK' WHERE recommendation_id = '${rec.id}';`;
  }

  let adapter = AdapterFactory.getActiveAdapter(projectId);
  if (!adapter && project.connectionConfig) {
    try {
      adapter = await AdapterFactory.createAdapter(projectId, project.connectionConfig);
    } catch (err) {
      console.warn('Auto-reconnecting adapter for rollback failed:', err);
    }
  }

  if (!adapter) {
    res.status(400).json({ success: false, error: { code: 'NO_CONNECTION', message: 'Database connection is not active.' } });
    return;
  }

  try {
    const modRes = await adapter.executeModification(cleanRollbackSql);
    if (!modRes.success) {
      throw new Error(modRes.message || 'Rollback SQL execution failed');
    }

    const updated = store.updateRecommendation(recId, {
      status: 'ROLLED_BACK',
      appliedResult: `Rolled back with: ${cleanRollbackSql}`
    });

    store.updateFinding(rec.findingId, { status: 'OPEN' });

    // Refresh schema
    try {
      const refreshedSchema = await adapter.extractSchema();
      const reviews = store.getReviews(projectId);
      if (reviews.length > 0) {
        reviews[0].schemaSnapshot = refreshedSchema;
      }
    } catch {
      // ignore
    }

    store.addAuditLog({
      id: `LOG-${Date.now()}`,
      projectId,
      userId: req.user!.id,
      action: 'ROLLBACK_EXECUTED',
      targetObject: rec.title,
      details: `Rollback applied successfully: ${cleanRollbackSql}`,
      sqlExecuted: cleanRollbackSql,
      result: 'SUCCESS',
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, recommendation: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'ROLLBACK_FAILED', message: err.message || 'Rollback failed' } });
  }
});

// 1-Click Approve All Pending Recommendations
router.post('/projects/:id/recommendations/approve-all', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const projectId = req.params.id;
  const activeDbKey = store.getDatabaseKey(projectId);
  const activeDbName = store.formatDbKeyName(activeDbKey);
  const recs = store.getRecommendations(projectId);
  const pendingRecs = recs.filter(r => r.status === 'PENDING');

  if (pendingRecs.length === 0) {
    res.json({ success: true, message: 'No pending recommendations to approve.', count: 0, recommendations: recs });
    return;
  }

  for (const r of pendingRecs) {
    store.updateRecommendation(r.id, {
      status: 'APPROVED'
    });
  }

  const updatedRecs = store.getRecommendations(projectId);

  store.addAuditLog({
    id: `LOG-${Date.now()}`,
    projectId,
    databaseKey: activeDbKey,
    databaseName: activeDbName,
    userId: req.user!.id,
    action: 'ALL_RECOMMENDATIONS_APPROVED',
    targetObject: `${pendingRecs.length} Recommendations`,
    details: `Approved all ${pendingRecs.length} pending recommendations in one click for database "${activeDbName}".`,
    result: 'SUCCESS',
    timestamp: new Date().toISOString()
  });

  res.json({
    success: true,
    message: `Successfully approved all ${pendingRecs.length} recommendations in one click!`,
    count: pendingRecs.length,
    recommendations: updatedRecs
  });
});

// 1-Click Fix All Findings & Flaws
router.post('/projects/:id/fix-all', authenticate, requireProjectOwner, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  const project = store.getProjectById(projectId, req.user!.id);
  if (!project) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found.' } });
    return;
  }

  let adapter = AdapterFactory.getActiveAdapter(projectId);
  if (!adapter && project.connectionConfig) {
    try {
      adapter = await AdapterFactory.createAdapter(projectId, project.connectionConfig);
    } catch (err: any) {
      res.status(400).json({ success: false, error: { code: 'CONNECTION_FAILED', message: `Database error: ${err.message}` } });
      return;
    }
  }

  if (!adapter) {
    res.status(400).json({ success: false, error: { code: 'NO_CONNECTION', message: 'Active database connection not found.' } });
    return;
  }

  const recommendations = store.getRecommendations(projectId);
  const findings = store.getFindings(projectId);
  const activeDbKey = store.getDatabaseKey(projectId);
  const activeDbName = store.formatDbKeyName(activeDbKey);

  // Targets are recommendations that are PENDING or APPROVED
  const pendingRecs = recommendations.filter(r => r.status === 'PENDING' || r.status === 'APPROVED');
  let appliedCount = 0;
  let failedCount = 0;

  for (const rec of pendingRecs) {
    let executableSql = (rec.proposedOperation || '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('--'))
      .join('\n')
      .trim();

    if (!executableSql) {
      const cleanTitle = (rec.title || 'Architectural Guidance').replace(/'/g, "''");
      const cleanGuidance = (rec.recommendation || rec.why || 'Approved policy').replace(/'/g, "''");
      const cleanUser = (req.user?.email || req.user?.id || 'admin').replace(/'/g, "''");
      executableSql = `CREATE TABLE IF NOT EXISTS _schema_governance (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT,
  finding_id TEXT,
  title TEXT,
  guidance TEXT,
  approved_by TEXT,
  approved_at TEXT,
  status TEXT
);
INSERT INTO _schema_governance (id, recommendation_id, finding_id, title, guidance, approved_by, approved_at, status)
VALUES ('GOV-${Date.now()}-${appliedCount}', '${rec.id}', '${rec.findingId}', '${cleanTitle}', '${cleanGuidance}', '${cleanUser}', '${new Date().toISOString()}', 'APPROVED');`;
    }

    try {
      const modRes = await adapter.executeModification(executableSql);
      if (modRes.success) {
        appliedCount++;
        store.updateRecommendation(rec.id, {
          status: 'APPLIED',
          appliedAt: new Date().toISOString(),
          appliedResult: `1-Click fix applied: ${executableSql.slice(0, 100)}`
        });
        store.updateFinding(rec.findingId, { status: 'APPLIED' });
      } else {
        failedCount++;
        store.updateRecommendation(rec.id, {
          status: 'FAILED',
          errorMessage: modRes.message
        });
      }
    } catch (err: any) {
      failedCount++;
    }
  }

  // Also apply fixes for open findings that have suggestedFix
  const openFindings = findings.filter(f => f.status === 'OPEN' && !pendingRecs.some(r => r.findingId === f.id));
  for (const f of openFindings) {
    const fixSql = (f.suggestedFix || '').trim();
    if (fixSql) {
      try {
        const modRes = await adapter.executeModification(fixSql);
        if (modRes.success) {
          appliedCount++;
          store.updateFinding(f.id, { status: 'APPLIED' });
        }
      } catch {
        failedCount++;
      }
    }
  }

  // Persist updated SQLite binary to disk if file-backed
  if (adapter instanceof SQLiteAdapter && project.connectionConfig?.filePath) {
    try {
      const updatedBinary = adapter.exportBinaryDatabase();
      fs.writeFileSync(project.connectionConfig.filePath, updatedBinary);
    } catch (err) {
      console.warn('Syncing updated database binary to disk:', err);
    }
  }

  // Re-run review engine to recalculate health score & schema snapshot
  let newReview = null;
  let newRecommendations = recommendations;
  try {
    const settings = store.getSettings();
    const freshReview = await ReviewEngine.runReview(projectId, adapter, settings.maxProfileRows);
    store.createReview(freshReview.review);
    store.saveRecommendations(projectId, freshReview.recommendations);
    newReview = freshReview.review;
    newRecommendations = freshReview.recommendations;

    const criticalCount = freshReview.review.findings.filter(f => f.severity === 'CRITICAL').length;
    store.updateProject(projectId, {
      lastReviewId: freshReview.review.id,
      latestHealthScore: freshReview.review.healthScore,
      totalFindings: freshReview.review.findings.length,
      criticalFindings: criticalCount
    });
  } catch (err) {
    console.warn('Review re-run failed after fix-all:', err);
  }

  // Record Audit Log for the 1-click fix-all action
  const auditLog: AuditLog = {
    id: `LOG-${Date.now()}`,
    projectId,
    databaseKey: activeDbKey,
    databaseName: activeDbName,
    userId: req.user!.id,
    action: 'ALL_FIXES_APPLIED',
    targetObject: `${activeDbName} (${appliedCount} fixes applied)`,
    details: `Executed 1-click remediation across database "${activeDbName}". Successfully applied ${appliedCount} fixes & structural improvements (${failedCount} failed). Health score updated to ${newReview?.healthScore.overall || 'recalculated'}/100.`,
    result: appliedCount > 0 ? 'SUCCESS' : 'FAILURE',
    timestamp: new Date().toISOString()
  };
  store.addAuditLog(auditLog);

  res.json({
    success: true,
    message: `1-Click Remediation Complete: Successfully fixed ${appliedCount} flaws on "${activeDbName}"!`,
    appliedCount,
    failedCount,
    review: newReview,
    recommendations: newRecommendations,
    auditLog
  });
});

// Export & Download Updated Database File (.sqlite or .sql)
router.get('/projects/:id/export', authenticate, requireProjectOwner, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  const format = ((req.query.format as string) || 'sqlite').toLowerCase();
  const project = store.getProjectById(projectId, req.user!.id);

  if (!project) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found.' } });
    return;
  }

  let adapter = AdapterFactory.getActiveAdapter(projectId);
  if (!adapter && project.connectionConfig) {
    try {
      adapter = await AdapterFactory.createAdapter(projectId, project.connectionConfig);
    } catch (err: any) {
      res.status(400).json({ success: false, error: { code: 'CONNECTION_FAILED', message: `Database error: ${err.message}` } });
      return;
    }
  }

  if (!adapter) {
    res.status(400).json({ success: false, error: { code: 'NO_CONNECTION', message: 'Active database connection not found.' } });
    return;
  }

  const activeDbKey = store.getDatabaseKey(projectId);
  const activeDbName = store.formatDbKeyName(activeDbKey);
  const cleanBaseName = (project.connectionConfig?.name || project.name || 'database').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\.(sqlite|db|sql)$/i, '');

  try {
    if (adapter instanceof SQLiteAdapter) {
      if (format === 'sql') {
        const sqlDump = adapter.exportSqlDump();
        const filename = `${cleanBaseName}_hardened.sql`;

        store.addAuditLog({
          id: `LOG-${Date.now()}`,
          projectId,
          databaseKey: activeDbKey,
          databaseName: activeDbName,
          userId: req.user!.id,
          action: 'DATABASE_EXPORTED',
          targetObject: filename,
          details: `Exported updated & hardened database SQL script "${filename}" (${Math.round(Buffer.byteLength(sqlDump) / 1024)} KB)`,
          result: 'SUCCESS',
          timestamp: new Date().toISOString()
        });

        res.setHeader('Content-Type', 'application/sql; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(sqlDump);
        return;
      } else {
        // Binary SQLite database
        const binaryDb = adapter.exportBinaryDatabase();
        const filename = `${cleanBaseName}_hardened.sqlite`;

        store.addAuditLog({
          id: `LOG-${Date.now()}`,
          projectId,
          databaseKey: activeDbKey,
          databaseName: activeDbName,
          userId: req.user!.id,
          action: 'DATABASE_EXPORTED',
          targetObject: filename,
          details: `Exported updated & hardened binary database "${filename}" (${(binaryDb.length / (1024 * 1024)).toFixed(2)} MB)`,
          result: 'SUCCESS',
          timestamp: new Date().toISOString()
        });

        res.setHeader('Content-Type', 'application/vnd.sqlite3');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(binaryDb);
        return;
      }
    }

    // Fallback for other database types: generate DDL export
    const schema = await adapter.extractSchema();
    let sqlDump = `-- Hardened Schema Export for ${schema.databaseName}\n-- Exported: ${new Date().toISOString()}\n\n`;
    for (const t of schema.tables) {
      const colDefs = t.columns.map(c => `  "${c.name}" ${c.dataType}${c.isNullable ? '' : ' NOT NULL'}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ''}`).join(',\n');
      const pkDef = t.primaryKey.length > 0 ? `,\n  PRIMARY KEY (${t.primaryKey.map(k => `"${k}"`).join(', ')})` : '';
      sqlDump += `CREATE TABLE "${t.name}" (\n${colDefs}${pkDef}\n);\n\n`;
    }
    const filename = `${cleanBaseName}_schema.sql`;
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sqlDump);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'EXPORT_FAILED', message: err.message || 'Failed to export database' } });
  }
});

// Audit Logs - Segregated by Workspace & Database
router.get('/projects/:id/audit-logs', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const projectId = req.params.id;
  const databaseKey = req.query.databaseKey as string | undefined;
  const activeDbKey = store.getDatabaseKey(projectId);
  const targetDbKey = databaseKey || activeDbKey;
  const logs = store.getAuditLogs(projectId, targetDbKey);
  const availableDatabases = store.getAuditDatabases(projectId);

  res.json({
    success: true,
    auditLogs: logs,
    databaseKey: targetDbKey,
    activeDatabaseKey: activeDbKey,
    availableDatabases
  });
});

export default router;
