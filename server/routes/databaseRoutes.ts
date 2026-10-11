import { Router, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { store } from '../db/store.js';
import { AuthenticatedRequest, authenticate, requireProjectOwner } from '../middleware/auth.js';
import { AdapterFactory } from '../adapters/AdapterFactory.js';
import { SAMPLE_DATABASES } from '../adapters/SampleDatabases.js';
import { DatabaseConnectionConfig } from '../../src/types.js';
import { encryptCredential } from '../utils/crypto.ts';
import { SQLiteAdapter } from '../adapters/SQLiteAdapter.js';
import { ReviewEngine } from '../engine/ReviewEngine.js';

// Configure upload limits for direct database files up to 150MB
const upload = multer({
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB max
  storage: multer.memoryStorage()
});

const uploadSingleFile = (req: any, res: any, next: any) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: { code: 'FILE_TOO_LARGE', message: 'File size exceeds maximum allowed limit of 150MB.' }
        });
      }
      return res.status(400).json({
        success: false,
        error: { code: 'UPLOAD_ERROR', message: err.message || 'File upload failed.' }
      });
    }
    next();
  });
};

// Configure chunked upload limits (each chunk up to 25MB, file up to 150MB)
const chunkUpload = multer({
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max per chunk (Cloud Run limit is 32MB)
  storage: multer.memoryStorage()
});

const uploadSingleChunk = (req: any, res: any, next: any) => {
  chunkUpload.single('chunk')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: { code: 'CHUNK_TOO_LARGE', message: 'Chunk size exceeds limit of 25MB.' }
        });
      }
      return res.status(400).json({
        success: false,
        error: { code: 'UPLOAD_ERROR', message: err.message || 'Chunk upload failed.' }
      });
    }
    next();
  });
};

const router = Router();

// List prepackaged sample databases
router.get('/samples', (_req, res: Response): void => {
  const samples = SAMPLE_DATABASES.map(s => ({
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    databaseType: s.databaseType
  }));
  res.json({ success: true, samples });
});

// Load sample database into project
router.post('/projects/:id/load-sample', authenticate, requireProjectOwner, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  const { sampleId } = req.body;
  const sample = SAMPLE_DATABASES.find(s => s.id === sampleId) || SAMPLE_DATABASES[0];

  try {
    const config: DatabaseConnectionConfig = {
      type: 'sqlite',
      isSample: true,
      sampleId: sample.id,
      name: sample.name
    };

    const adapter = await AdapterFactory.createAdapter(projectId, config);
    const testRes = await adapter.testConnection();

    // Reset any previous review and recommendation history for this project so the newly loaded sample is audited fresh
    store.resetProjectReviewData(projectId);

    let freshReview: any = null;
    let freshRecommendations: any[] = [];
    if (testRes.success) {
      try {
        const reviewResult = await ReviewEngine.runReview(projectId, adapter, 500, { resetApplied: true });
        store.createReview(reviewResult.review, false);
        store.saveRecommendations(projectId, reviewResult.recommendations);
        freshReview = reviewResult.review;
        freshRecommendations = reviewResult.recommendations;
      } catch (revErr) {
        console.warn('Initial review on load-sample failed:', revErr);
      }
    }

    const criticalCount = freshReview?.findings?.filter((f: any) => f.severity === 'CRITICAL')?.length || 0;
    const openCount = freshReview?.findings?.filter((f: any) => f.status !== 'APPLIED')?.length || 0;

    store.updateProject(projectId, {
      databaseType: 'sqlite',
      connectionConfig: config,
      connectionStatus: testRes.success ? 'CONNECTED' : 'ERROR',
      connectionError: testRes.success ? undefined : testRes.message,
      lastReviewId: freshReview?.id,
      latestHealthScore: freshReview?.healthScore,
      totalFindings: openCount,
      criticalFindings: criticalCount
    });

    store.addAuditLog({
      id: `LOG-${Date.now()}`,
      projectId,
      userId: req.user!.id,
      action: 'DATABASE_CONNECTED',
      targetObject: sample.name,
      details: `Loaded sample database "${sample.name}" with pre-seeded schemas and ${openCount} open findings ready for 1-click remediation.`,
      result: 'SUCCESS',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `Sample database "${sample.name}" loaded successfully with ${openCount} findings identified!`,
      testResult: testRes,
      review: freshReview,
      recommendations: freshRecommendations
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SAMPLE_LOAD_FAILED', message: err.message || 'Failed to load sample database' } });
  }
});

// Connect with credentials or connection string (Step 7: Encrypted Passwords)
router.post('/projects/:id/connection', authenticate, requireProjectOwner, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  const config: DatabaseConnectionConfig = req.body;

  if (!config.type) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Database type is required.' } });
    return;
  }

  try {
    // Encrypt raw password before saving to store
    const encryptedPassword = config.password ? encryptCredential(config.password) : undefined;
    const secureConfig: DatabaseConnectionConfig = {
      ...config,
      password: encryptedPassword
    };

    // Test connection with original config before saving
    const adapter = await AdapterFactory.createAdapter(projectId, config);
    const testResult = await adapter.testConnection();

    store.updateProject(projectId, {
      databaseType: config.type,
      connectionConfig: secureConfig,
      connectionStatus: testResult.success ? 'CONNECTED' : 'ERROR',
      connectionError: testResult.success ? undefined : testResult.message
    });

    res.json({ success: testResult.success, testResult });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'CONNECTION_FAILED', message: err.message || 'Connection failed' } });
  }
});

// Upload .sql or .sqlite file
router.post('/projects/:id/upload', authenticate, requireProjectOwner, uploadSingleFile, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;

  if (!req.file) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'No file uploaded.' } });
    return;
  }

  try {
    const filename = req.file.originalname;
    const isSql = filename.endsWith('.sql');
    const isSqlite = filename.endsWith('.sqlite') || filename.endsWith('.db') || filename.endsWith('.sqlite3');

    if (!isSql && !isSqlite) {
      res.status(400).json({ success: false, error: { code: 'INVALID_FILE_TYPE', message: 'Supported file types are .sql DDL scripts or .sqlite / .db database files.' } });
      return;
    }

    // Persist uploaded file to data/uploads directory so reconnection works reliably
    const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const safeFilename = `${projectId}-${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(uploadsDir, safeFilename);
    fs.writeFileSync(filePath, req.file.buffer);

    const config: DatabaseConnectionConfig = {
      type: 'sqlite',
      name: filename,
      filePath
    };

    const adapter = await AdapterFactory.createAdapter(projectId, config, req.file.buffer);
    const testResult = await adapter.testConnection();

    store.updateProject(projectId, {
      databaseType: 'sqlite',
      connectionConfig: config,
      connectionStatus: testResult.success ? 'CONNECTED' : 'ERROR',
      connectionError: testResult.success ? undefined : testResult.message
    });

    store.addAuditLog({
      id: `LOG-${Date.now()}`,
      projectId,
      userId: req.user!.id,
      action: 'DATABASE_CONNECTED',
      targetObject: filename,
      details: `Imported database file "${filename}" (${Math.round(req.file.size / 1024)} KB)`,
      result: 'SUCCESS',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `File "${filename}" imported successfully!`,
      testResult
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'UPLOAD_FAILED', message: err.message || 'File import failed' } });
  }
});

// Chunked file upload to bypass Cloud Run 32MB HTTP body limit (supporting up to 150MB-200MB)
router.post('/projects/:id/upload-chunk', authenticate, requireProjectOwner, uploadSingleChunk, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  const uploadId = (req.body.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const chunkIndex = parseInt(req.body.chunkIndex, 10);
  const totalChunks = parseInt(req.body.totalChunks, 10);
  const filename = req.body.filename;
  const totalSize = parseInt(req.body.totalSize || '0', 10);

  if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !filename) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing chunk metadata (uploadId, chunkIndex, totalChunks, filename).' } });
    return;
  }

  const MAX_TOTAL_SIZE = 150 * 1024 * 1024; // 150MB
  if (totalSize > MAX_TOTAL_SIZE) {
    res.status(400).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: `File size (${(totalSize / (1024 * 1024)).toFixed(1)}MB) exceeds maximum allowed limit of 150MB.` }
    });
    return;
  }

  if (!req.file || !req.file.buffer) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Chunk binary payload is missing.' } });
    return;
  }

  const isSql = filename.endsWith('.sql');
  const isSqlite = filename.endsWith('.sqlite') || filename.endsWith('.db') || filename.endsWith('.sqlite3');

  if (!isSql && !isSqlite) {
    res.status(400).json({ success: false, error: { code: 'INVALID_FILE_TYPE', message: 'Supported file types are .sql DDL scripts or .sqlite / .db database files.' } });
    return;
  }

  const uploadsDir = path.resolve(process.cwd(), 'data', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const tempFilePath = path.join(uploadsDir, `temp-${projectId}-${uploadId}.part`);

  try {
    // If first chunk, clear any existing temp file with this uploadId
    if (chunkIndex === 0 && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    // Append this chunk to the temp file
    fs.appendFileSync(tempFilePath, req.file.buffer);

    // If this is not the last chunk, return intermediate success
    if (chunkIndex < totalChunks - 1) {
      res.json({
        success: true,
        completed: false,
        chunkIndex,
        totalChunks,
        progress: Math.round(((chunkIndex + 1) / totalChunks) * 100)
      });
      return;
    }

    // Final chunk reached: Assemble & finalize database file
    const safeFilename = `${projectId}-${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const finalFilePath = path.join(uploadsDir, safeFilename);

    // Move/rename temp file to final destination
    fs.renameSync(tempFilePath, finalFilePath);

    const stats = fs.statSync(finalFilePath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

    const config: DatabaseConnectionConfig = {
      type: 'sqlite',
      name: filename,
      filePath: finalFilePath
    };

    // Load file from finalFilePath
    const adapter = await AdapterFactory.createAdapter(projectId, config);
    const testResult = await adapter.testConnection();

    store.updateProject(projectId, {
      databaseType: 'sqlite',
      connectionConfig: config,
      connectionStatus: testResult.success ? 'CONNECTED' : 'ERROR',
      connectionError: testResult.success ? undefined : testResult.message
    });

    store.addAuditLog({
      id: `LOG-${Date.now()}`,
      projectId,
      userId: req.user!.id,
      action: 'DATABASE_CONNECTED',
      targetObject: filename,
      details: `Imported database file "${filename}" (${sizeMb} MB) via chunked streaming`,
      result: 'SUCCESS',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      completed: true,
      message: `File "${filename}" (${sizeMb} MB) imported successfully!`,
      testResult
    });
  } catch (err: any) {
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }
    console.error('Chunk upload processing error:', err);
    res.status(500).json({ success: false, error: { code: 'UPLOAD_FAILED', message: err.message || 'File assembly failed' } });
  }
});

// Get extracted schema for project
router.get('/projects/:id/schema', authenticate, requireProjectOwner, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  let adapter = AdapterFactory.getActiveAdapter(projectId);

  if (!adapter) {
    const project = store.getProjectById(projectId, req.user!.id);
    if (project && project.connectionConfig) {
      try {
        adapter = await AdapterFactory.createAdapter(projectId, project.connectionConfig);
      } catch (err) {
        console.warn('Auto reconnect failed:', err);
      }
    }
  }

  if (!adapter) {
    res.status(400).json({ success: false, error: { code: 'NO_CONNECTION', message: 'Database is not connected. Please connect or load a sample database first.' } });
    return;
  }

  try {
    const schema = await adapter.extractSchema();

    // Preserve profiling statistics from latest review snapshot if available
    const reviews = store.getReviews(projectId);
    const latestReview = reviews[0];
    if (latestReview?.schemaSnapshot) {
      for (const table of schema.tables) {
        const snapTable = latestReview.schemaSnapshot.tables.find(t => t.name === table.name);
        if (snapTable) {
          for (const col of table.columns) {
            const snapCol = snapTable.columns.find(c => c.name === col.name);
            if (snapCol && snapCol.nullPercentage !== undefined) {
              col.nullCount = snapCol.nullCount;
              col.nullPercentage = snapCol.nullPercentage;
              col.distinctCount = snapCol.distinctCount;
              col.sampleValues = snapCol.sampleValues;
              col.piiFlag = snapCol.piiFlag;
            }
          }
        }
      }
    }

    res.json({ success: true, schema, capabilities: adapter.getCapabilities() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SCHEMA_EXTRACTION_FAILED', message: err.message || 'Schema extraction failed' } });
  }
});

// Run Data Quality Profiler on single table or all tables
router.post('/projects/:id/profile', authenticate, requireProjectOwner, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  const { tableName, maxRows = 500 } = req.body;

  let adapter = AdapterFactory.getActiveAdapter(projectId);
  if (!adapter) {
    const project = store.getProjectById(projectId, req.user!.id);
    if (project && project.connectionConfig) {
      try {
        adapter = await AdapterFactory.createAdapter(projectId, project.connectionConfig);
      } catch (err) {
        console.warn('Auto reconnect for profiling failed:', err);
      }
    }
  }

  if (!adapter) {
    res.status(400).json({
      success: false,
      error: { code: 'NO_CONNECTION', message: 'Database is not connected. Please connect or load a sample database first.' }
    });
    return;
  }

  try {
    const schema = await adapter.extractSchema();
    const tablesToProfile = tableName && tableName !== 'ALL'
      ? schema.tables.filter(t => t.name.toLowerCase() === tableName.toLowerCase())
      : schema.tables;

    if (tablesToProfile.length === 0) {
      res.status(404).json({ success: false, error: { code: 'TABLE_NOT_FOUND', message: `Table "${tableName}" not found in database.` } });
      return;
    }

    const tableProfiles: Record<string, any> = {};

    for (const table of tablesToProfile) {
      const profile = await adapter.profileTable(table.name, maxRows);
      tableProfiles[table.name] = profile;

      for (const col of table.columns) {
        const nullCount = profile.nullCounts[col.name] ?? 0;
        const totalRows = profile.totalRows || 1;
        col.nullCount = nullCount;
        col.nullPercentage = Math.round((nullCount / totalRows) * 100);
        col.distinctCount = profile.distinctCounts[col.name] ?? 0;

        const sampleVals = profile.sampleRows
          .map(r => r[col.name])
          .filter(v => v !== null && v !== undefined && v !== '');
        col.sampleValues = sampleVals.slice(0, 5);

        // PII Detection
        const lower = col.name.toLowerCase();
        const sampleStr = sampleVals.map(v => String(v)).join(' ');

        if (lower.includes('email') || /^[^\s@]+@[^\s@]+\.[^\s@]+/.test(sampleStr)) {
          col.piiFlag = { type: 'EMAIL', confidence: 96, maskedSample: '[REDACTED_EMAIL]' };
        } else if (lower.includes('ssn') || lower.includes('social') || /\b\d{3}-\d{2}-\d{4}\b/.test(sampleStr)) {
          col.piiFlag = { type: 'SSN', confidence: 98, maskedSample: '***-**-****' };
        } else if (lower.includes('card') || lower.includes('cvv') || lower.includes('cc_') || /\b(?:\d{4}[ -]?){3}\d{4}\b/.test(sampleStr)) {
          col.piiFlag = { type: 'FINANCIAL', confidence: 95, maskedSample: '****-****-****-****' };
        } else if (lower.includes('pass') || lower === 'pwd' || lower.includes('secret') || lower.includes('token')) {
          col.piiFlag = { type: 'PASSWORD', confidence: 99, maskedSample: '••••••••' };
        } else if (lower.includes('phone') || lower.includes('mobile') || lower.includes('cell')) {
          col.piiFlag = { type: 'PHONE', confidence: 92, maskedSample: '+1 (***) ***-****' };
        } else if (lower.includes('address') || lower.includes('street') || lower.includes('postal') || lower.includes('zipcode')) {
          col.piiFlag = { type: 'ADDRESS', confidence: 88, maskedSample: '[REDACTED_ADDRESS]' };
        } else if (lower.includes('first_name') || lower.includes('last_name') || lower === 'name' || lower.includes('full_name')) {
          col.piiFlag = { type: 'NAME', confidence: 85, maskedSample: '[REDACTED_NAME]' };
        }
      }
    }

    // Persist profiled stats into latest review snapshot
    const reviews = store.getReviews(projectId);
    if (reviews.length > 0) {
      reviews[0].schemaSnapshot = schema;
    }

    res.json({
      success: true,
      message: tableName && tableName !== 'ALL'
        ? `Profiled table "${tableName}" successfully!`
        : `Profiled all ${tablesToProfile.length} tables successfully!`,
      tableProfiles,
      schema
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'PROFILING_FAILED', message: err.message || 'Profiling failed' } });
  }
});

// Step 18: Download updated SQLite .db file
router.get('/projects/:id/download-db', authenticate, requireProjectOwner, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  const adapter = AdapterFactory.getActiveAdapter(projectId);

  if (!adapter || adapter.type !== 'sqlite') {
    res.status(400).json({
      success: false,
      error: { code: 'NOT_SUPPORTED', message: 'Binary .db download is available for SQLite databases. For remote SQL databases, use SQL Migration Download.' }
    });
    return;
  }

  try {
    const sqliteAdapter = adapter as SQLiteAdapter;
    const dbBuffer = sqliteAdapter.exportDatabaseBinary();

    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Disposition', `attachment; filename="updated-database-${projectId}.db"`);
    res.send(dbBuffer);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DOWNLOAD_FAILED', message: err.message || 'Failed to generate SQLite binary download' } });
  }
});

// Step 18: Download SQL Migration file
router.get('/projects/:id/download-migration', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const projectId = req.params.id;
  const recommendations = store.getRecommendations(projectId);

  const appliedOrPendingRecs = recommendations.filter(r => r.proposedOperation && !r.proposedOperation.startsWith('--'));

  const script = `-- =======================================================
-- AI POWERED DATABASE REVIEWER: REMEDIATION MIGRATION SCRIPT
-- Project: ${projectId}
-- Timestamp: ${new Date().toISOString()}
-- =======================================================\n\n` +
    appliedOrPendingRecs.map(r => `-- Finding: ${r.title} (Status: ${r.status})\n${r.proposedOperation}\n`).join('\n');

  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="database-remediation-${projectId}.sql"`);
  res.send(script);
});

export default router;
