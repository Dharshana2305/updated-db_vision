import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { AuthenticatedRequest, authenticate, requireProjectOwner } from '../middleware/auth.js';
import { AdapterFactory } from '../adapters/AdapterFactory.js';
import { ReviewEngine } from '../engine/ReviewEngine.js';

const router = Router();

// Run new review (Protected with Ownership Check)
router.post('/projects/:id/review/run', authenticate, requireProjectOwner, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  let adapter = AdapterFactory.getActiveAdapter(projectId);

  if (!adapter) {
    const project = store.getProjectById(projectId, req.user!.id);
    if (project?.connectionConfig) {
      try {
        adapter = await AdapterFactory.createAdapter(projectId, project.connectionConfig);
      } catch (err: any) {
        res.status(400).json({ success: false, error: { code: 'CONNECTION_FAILED', message: `Could not connect to database: ${err.message}` } });
        return;
      }
    }
  }

  if (!adapter) {
    res.status(400).json({ success: false, error: { code: 'NO_CONNECTION', message: 'Database is not connected. Please connect or upload a database file first.' } });
    return;
  }

  try {
    const settings = store.getSettings();
    const { review, recommendations } = await ReviewEngine.runReview(projectId, adapter, settings.maxProfileRows);

    store.createReview(review);
    store.saveRecommendations(projectId, recommendations);

    // Update project with latest metrics
    const criticalCount = review.findings.filter(f => f.status !== 'APPLIED' && f.severity === 'CRITICAL').length;
    const openFindingsCount = review.findings.filter(f => f.status !== 'APPLIED').length;
    store.updateProject(projectId, {
      lastReviewId: review.id,
      latestHealthScore: review.healthScore,
      totalFindings: openFindingsCount,
      criticalFindings: criticalCount
    });

    // Record in Audit Log
    store.addAuditLog({
      id: `LOG-${Date.now()}`,
      projectId,
      userId: req.user!.id,
      action: 'REVIEW_CREATED',
      targetObject: review.schemaSnapshot.databaseName,
      details: `Executed comprehensive database audit. Health score: ${review.healthScore.overall}/100. Discovered ${review.findings.length} findings (${criticalCount} critical).`,
      result: 'SUCCESS',
      timestamp: new Date().toISOString()
    });

    res.status(201).json({ success: true, review, recommendations });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'REVIEW_FAILED', message: err.message || 'Review execution failed' } });
  }
});

// List all reviews for project
router.get('/projects/:id/reviews', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const reviews = store.getReviews(req.params.id);
  res.json({ success: true, reviews });
});

// Get specific review
router.get('/projects/:id/reviews/:reviewId', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const review = store.getReviewById(req.params.reviewId);
  if (!review) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Review not found.' } });
    return;
  }
  res.json({ success: true, review });
});

// Step 19 & 20: Compare two reviews using stable fingerprints and schema drift
router.get('/projects/:id/compare', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const { r1, r2 } = req.query as { r1?: string; r2?: string };
  const reviews = store.getReviews(req.params.id);

  if (!reviews || reviews.length === 0) {
    res.status(200).json({
      success: true,
      hasMultipleReviews: false,
      message: 'No reviews found for this project yet. Please run an automated audit first.',
      olderReview: null,
      newerReview: null,
      scoreDelta: 0,
      resolvedCount: 0,
      newCount: 0,
      persistentCount: 0,
      resolvedIssues: [],
      newIssues: [],
      persistentIssues: [],
      schemaDrift: {
        hasChanges: false,
        addedTables: [],
        removedTables: [],
        modifiedTables: [],
        totalTablesDelta: 0,
        totalColumnsDelta: 0,
        totalIndexesDelta: 0
      }
    });
    return;
  }

  if (reviews.length === 1) {
    const rev = reviews[0];
    const resolvedInCurrent = rev.findings.filter(f => f.status === 'APPLIED' || f.status === 'APPROVED');
    const openInCurrent = rev.findings.filter(f => f.status !== 'APPLIED' && f.status !== 'APPROVED');

    const singleComparison = {
      targetScore: rev.healthScore.overall,
      baseScore: rev.healthScore.overall,
      scoreDelta: 0,
      categoryDeltas: {},
      resolvedFindings: resolvedInCurrent,
      newFindings: [],
      persistentFindings: openInCurrent,
      schemaDrift: {
        hasChanges: false,
        addedTables: [],
        removedTables: [],
        modifiedTables: [],
        totalTablesDelta: 0,
        totalColumnsDelta: 0,
        totalIndexesDelta: 0
      },
      olderReview: {
        id: rev.id,
        date: rev.createdAt,
        overallScore: rev.healthScore.overall,
        categoryScores: rev.healthScore.categories
      },
      newerReview: {
        id: rev.id,
        date: rev.createdAt,
        overallScore: rev.healthScore.overall,
        categoryScores: rev.healthScore.categories
      }
    };

    res.status(200).json({
      success: true,
      hasMultipleReviews: false,
      isBaselineOnly: true,
      message: 'Initial baseline review. Apply schema fixes and run a second review to view full historical drift.',
      comparison: singleComparison,
      olderReview: singleComparison.olderReview,
      newerReview: singleComparison.newerReview,
      scoreDelta: 0,
      resolvedCount: resolvedInCurrent.length,
      newCount: 0,
      persistentCount: openInCurrent.length,
      resolvedIssues: resolvedInCurrent,
      newIssues: [],
      persistentIssues: openInCurrent,
      schemaDrift: singleComparison.schemaDrift
    });
    return;
  }

  // Two or more reviews available
  const reviewOlder = r1 ? store.getReviewById(r1) : (reviews[1] || reviews[0]);
  const reviewNewer = r2 ? store.getReviewById(r2) : reviews[0];

  if (!reviewOlder || !reviewNewer) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'One or both review records could not be found.' } });
    return;
  }

  // Stable Fingerprint helper: category|databaseObject|title
  const getFingerprint = (f: any) => `${f.category}|${f.databaseObject}|${f.title}`;

  const resolvedIssues: any[] = [];
  const persistentIssues: any[] = [];
  const newIssues: any[] = [];

  const olderMap = new Map(reviewOlder.findings.map(f => [getFingerprint(f), f]));
  const newerMap = new Map(reviewNewer.findings.map(f => [getFingerprint(f), f]));

  for (const fOld of reviewOlder.findings) {
    const fp = getFingerprint(fOld);
    const fNew = newerMap.get(fp);
    if (!fNew) {
      // Finding was resolved / eliminated in newer schema run
      resolvedIssues.push({
        ...fOld,
        resolutionReason: 'Vulnerability mitigated in current database state',
        status: 'APPLIED'
      });
    } else if (fNew.status === 'APPLIED' || fNew.status === 'APPROVED') {
      // Finding was marked resolved / applied
      resolvedIssues.push({
        ...fNew,
        resolutionReason: 'Approved & verified in database governance log',
        status: 'APPLIED'
      });
    } else {
      // Still open
      persistentIssues.push(fNew);
    }
  }

  for (const fNew of reviewNewer.findings) {
    const fp = getFingerprint(fNew);
    if (!olderMap.has(fp)) {
      if (fNew.status !== 'APPLIED' && fNew.status !== 'APPROVED') {
        newIssues.push(fNew);
      }
    }
  }

  const scoreDelta = reviewNewer.healthScore.overall - reviewOlder.healthScore.overall;

  // Category Deltas
  const categoryDeltas: Record<string, number> = {};
  const olderCats = reviewOlder.healthScore?.categories || {};
  const newerCats = reviewNewer.healthScore?.categories || {};
  const allCatKeys = Array.from(new Set([...Object.keys(olderCats), ...Object.keys(newerCats)]));
  for (const key of allCatKeys) {
    categoryDeltas[key] = (newerCats[key] || 0) - (olderCats[key] || 0);
  }

  // Detailed Schema Drift Analysis
  const oldTables = reviewOlder.schemaSnapshot?.tables || [];
  const newTables = reviewNewer.schemaSnapshot?.tables || [];
  const oldTableMap = new Map(oldTables.map(t => [t.name, t]));
  const newTableMap = new Map(newTables.map(t => [t.name, t]));

  const addedTables = newTables.filter(t => !oldTableMap.has(t.name)).map(t => ({
    name: t.name,
    columnsCount: t.columns?.length || 0,
    rowCount: t.rowCount || 0
  }));

  const removedTables = oldTables.filter(t => !newTableMap.has(t.name)).map(t => ({
    name: t.name,
    columnsCount: t.columns?.length || 0,
    rowCount: t.rowCount || 0
  }));

  const modifiedTables: any[] = [];

  for (const newTable of newTables) {
    const oldTable = oldTableMap.get(newTable.name);
    if (!oldTable) continue;

    const oldColMap = new Map((oldTable.columns || []).map(c => [c.name, c]));
    const newColMap = new Map((newTable.columns || []).map(c => [c.name, c]));

    const addedColumns = (newTable.columns || []).filter(c => !oldColMap.has(c.name)).map(c => `${c.name} (${c.dataType})`);
    const removedColumns = (oldTable.columns || []).filter(c => !newColMap.has(c.name)).map(c => `${c.name} (${c.dataType})`);
    const modifiedColumns = (newTable.columns || []).filter(c => {
      const oc = oldColMap.get(c.name);
      return oc && (oc.dataType !== c.dataType || oc.isNullable !== c.isNullable);
    }).map(c => {
      const oc = oldColMap.get(c.name)!;
      return `${c.name}: ${oc.dataType}${oc.isNullable ? '' : ' NOT NULL'} → ${c.dataType}${c.isNullable ? '' : ' NOT NULL'}`;
    });

    const oldIdxSet = new Set((oldTable.indexes || []).map(i => i.name));
    const newIdxSet = new Set((newTable.indexes || []).map(i => i.name));

    const addedIndexes = (newTable.indexes || []).filter(i => !oldIdxSet.has(i.name)).map(i => i.name);
    const removedIndexes = (oldTable.indexes || []).filter(i => !newIdxSet.has(i.name)).map(i => i.name);
    const rowCountDelta = (newTable.rowCount || 0) - (oldTable.rowCount || 0);

    if (
      addedColumns.length > 0 ||
      removedColumns.length > 0 ||
      modifiedColumns.length > 0 ||
      addedIndexes.length > 0 ||
      removedIndexes.length > 0 ||
      rowCountDelta !== 0
    ) {
      modifiedTables.push({
        tableName: newTable.name,
        addedColumns,
        removedColumns,
        modifiedColumns,
        addedIndexes,
        removedIndexes,
        rowCountDelta,
        currentRowCount: newTable.rowCount || 0
      });
    }
  }

  const schemaDrift = {
    hasChanges: addedTables.length > 0 || removedTables.length > 0 || modifiedTables.length > 0,
    addedTables,
    removedTables,
    modifiedTables,
    totalTablesDelta: newTables.length - oldTables.length,
    totalColumnsDelta: (reviewNewer.schemaSnapshot?.summary?.totalColumns || 0) - (reviewOlder.schemaSnapshot?.summary?.totalColumns || 0),
    totalIndexesDelta: (reviewNewer.schemaSnapshot?.summary?.totalIndexes || 0) - (reviewOlder.schemaSnapshot?.summary?.totalIndexes || 0)
  };

  const comparison = {
    targetScore: reviewNewer.healthScore.overall,
    baseScore: reviewOlder.healthScore.overall,
    scoreDelta,
    categoryDeltas,
    resolvedFindings: resolvedIssues,
    newFindings: newIssues,
    persistentFindings: persistentIssues,
    schemaDrift,
    olderReview: {
      id: reviewOlder.id,
      date: reviewOlder.createdAt,
      overallScore: reviewOlder.healthScore.overall,
      categoryScores: reviewOlder.healthScore.categories
    },
    newerReview: {
      id: reviewNewer.id,
      date: reviewNewer.createdAt,
      overallScore: reviewNewer.healthScore.overall,
      categoryScores: reviewNewer.healthScore.categories
    }
  };

  res.json({
    success: true,
    hasMultipleReviews: true,
    comparison,
    olderReview: comparison.olderReview,
    newerReview: comparison.newerReview,
    scoreDelta,
    categoryDeltas,
    resolvedCount: resolvedIssues.length,
    newCount: newIssues.length,
    persistentCount: persistentIssues.length,
    resolvedIssues,
    newIssues,
    persistentIssues,
    schemaDrift
  });
});

export default router;
