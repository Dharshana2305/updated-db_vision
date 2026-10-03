import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { AuthenticatedRequest, authenticate, requireProjectOwner } from '../middleware/auth.js';
import { AdapterFactory } from '../adapters/AdapterFactory.js';
import { AuditLog } from '../../src/types.js';

const router = Router();

// Get findings for project (Protected with Ownership Check)
router.get('/projects/:id/findings', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const findings = store.getFindings(req.params.id);
  res.json({ success: true, findings });
});

// Update finding (notes, status)
router.patch('/findings/:id', authenticate, (req: AuthenticatedRequest, res: Response): void => {
  const { notes, status } = req.body;

  const updated = store.updateFinding(req.params.id, {
    ...(notes !== undefined ? { notes } : {}),
    ...(status !== undefined ? { status } : {})
  });

  if (!updated) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Finding not found.' } });
    return;
  }

  res.json({ success: true, finding: updated });
});

// Directly apply fix for a finding
router.post('/findings/:id/apply-fix', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const findingId = req.params.id;
  const { projectId } = req.body;

  if (!projectId) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'ProjectId is required.' } });
    return;
  }

  const project = store.getProjectById(projectId, req.user!.id);
  if (!project) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    return;
  }

  const findings = store.getFindings(projectId);
  const finding = findings.find(f => f.id === findingId);
  if (!finding) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Finding not found.' } });
    return;
  }

  const fixSql = (finding.suggestedFix || '').trim();
  let cleanSql = fixSql
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('--'))
    .join('\n')
    .trim();

  let isArchitectural = false;
  if (!cleanSql) {
    isArchitectural = true;
    const cleanTitle = (finding.title || 'Architectural Policy').replace(/'/g, "''");
    const cleanDesc = (finding.description || finding.recommendation || 'Approved').replace(/'/g, "''");
    const cleanUser = (req.user?.email || req.user?.id || 'admin').replace(/'/g, "''");
    cleanSql = `CREATE TABLE IF NOT EXISTS _schema_governance (
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
VALUES ('GOV-${Date.now()}', 'REC-${finding.id}', '${finding.id}', '${cleanTitle}', '${cleanDesc}', '${cleanUser}', '${new Date().toISOString()}', 'APPROVED');`;
  }

  let adapter = AdapterFactory.getActiveAdapter(projectId);
  if (!adapter && project.connectionConfig) {
    try {
      adapter = await AdapterFactory.createAdapter(projectId, project.connectionConfig);
    } catch (err) {
      console.warn('Auto-reconnecting adapter for finding fix failed:', err);
    }
  }

  if (!adapter) {
    res.status(400).json({ success: false, error: { code: 'NO_CONNECTION', message: 'Database connection is not active.' } });
    return;
  }

  try {
    const modRes = await adapter.executeModification(cleanSql);
    if (!modRes.success) {
      throw new Error(modRes.message || 'Execution error');
    }

    const updatedFinding = store.updateFinding(findingId, { status: 'APPLIED' });

    // Update corresponding recommendation if present
    const recs = store.getRecommendations(projectId);
    const matchingRec = recs.find(r => r.findingId === findingId || r.id === `REC-${findingId}`);
    if (matchingRec) {
      store.updateRecommendation(matchingRec.id, {
        status: 'APPLIED',
        appliedAt: new Date().toISOString(),
        appliedResult: `Applied fix via Findings page: ${cleanSql}`
      });
    }

    // Refresh review schema snapshot
    try {
      const refreshedSchema = await adapter.extractSchema();
      const reviews = store.getReviews(projectId);
      if (reviews.length > 0) {
        reviews[0].schemaSnapshot = refreshedSchema;
      }
    } catch {
      // ignore
    }

    // Record audit log
    const auditLog: AuditLog = {
      id: `LOG-${Date.now()}`,
      projectId,
      userId: req.user!.id,
      action: 'FIX_APPLIED',
      targetObject: `${finding.table}${finding.column ? `.${finding.column}` : ''}`,
      details: `Applied fix for finding "${finding.title}": ${cleanSql}`,
      sqlExecuted: cleanSql,
      result: 'SUCCESS',
      timestamp: new Date().toISOString()
    };
    store.addAuditLog(auditLog);

    res.json({
      success: true,
      message: `Fix applied successfully for "${finding.title}"!`,
      finding: updatedFinding,
      auditLog
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'FIX_EXECUTION_FAILED', message: err.message || 'Failed to apply fix on database' }
    });
  }
});

// Rollback finding fix
router.post('/findings/:id/rollback-fix', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const findingId = req.params.id;
  const { projectId } = req.body;

  if (!projectId) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'ProjectId is required.' } });
    return;
  }

  const project = store.getProjectById(projectId, req.user!.id);
  if (!project) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied.' } });
    return;
  }

  const findings = store.getFindings(projectId);
  const finding = findings.find(f => f.id === findingId);
  if (!finding) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Finding not found.' } });
    return;
  }

  const recs = store.getRecommendations(projectId);
  const matchingRec = recs.find(r => r.findingId === findingId || r.id === `REC-${findingId}`);
  const rollbackSql = finding.rollbackSql || matchingRec?.rollbackOperation;

  const cleanRollbackSql = (rollbackSql || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('--'))
    .join('\n')
    .trim();

  if (!cleanRollbackSql) {
    res.status(400).json({
      success: false,
      error: { code: 'NO_ROLLBACK_SQL', message: 'No automated rollback SQL is available for this change.' }
    });
    return;
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
      throw new Error(modRes.message || 'Execution error');
    }

    const updatedFinding = store.updateFinding(findingId, { status: 'OPEN' });

    if (matchingRec) {
      store.updateRecommendation(matchingRec.id, {
        status: 'ROLLED_BACK',
        appliedResult: `Rolled back: ${cleanRollbackSql}`
      });
    }

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
      targetObject: `${finding.table}${finding.column ? `.${finding.column}` : ''}`,
      details: `Rolled back fix for finding "${finding.title}": ${cleanRollbackSql}`,
      sqlExecuted: cleanRollbackSql,
      result: 'SUCCESS',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `Rollback executed successfully for "${finding.title}"!`,
      finding: updatedFinding
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'ROLLBACK_FAILED', message: err.message || 'Failed to rollback fix on database' }
    });
  }
});

export default router;
