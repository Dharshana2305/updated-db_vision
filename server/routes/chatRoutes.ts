import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { AuthenticatedRequest, authenticate, requireProjectOwner } from '../middleware/auth.js';
import { AdapterFactory } from '../adapters/AdapterFactory.js';
import { SAMPLE_DATABASES } from '../adapters/SampleDatabases.js';
import { SQLiteAdapter } from '../adapters/SQLiteAdapter.js';
import { AIService } from '../ai/AIService.js';
import { ChatMessage } from '../../src/types.js';

const router = Router();

// Get chat history for specific database or active database
router.get('/projects/:id/chat', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const projectId = req.params.id;
  const databaseKey = req.query.databaseKey as string | undefined;
  const activeDbKey = store.getDatabaseKey(projectId);
  const targetDbKey = databaseKey || activeDbKey;
  const messages = store.getChatMessages(projectId, targetDbKey);
  const availableDatabases = store.getChatDatabases(projectId);

  res.json({
    success: true,
    messages,
    databaseKey: targetDbKey,
    activeDatabaseKey: activeDbKey,
    availableDatabases
  });
});

// Clear chat history for specific database
router.delete('/projects/:id/chat', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const projectId = req.params.id;
  const databaseKey = req.query.databaseKey as string | undefined;
  const activeDbKey = store.getDatabaseKey(projectId);
  const targetDbKey = databaseKey || activeDbKey;

  store.clearChatMessages(projectId, targetDbKey);

  res.json({
    success: true,
    message: 'Chat history cleared successfully for this database.',
    databaseKey: targetDbKey
  });
});

// Send chat message (RAG schema assistant)
router.post('/projects/:id/chat', authenticate, requireProjectOwner, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  const { message, databaseKey } = req.body;

  if (!message || !message.trim()) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Message content is required.' } });
    return;
  }

  const activeDbKey = store.getDatabaseKey(projectId);
  const targetDbKey = databaseKey || activeDbKey;

  // 1. Save user message to this specific database thread
  const userMsg: ChatMessage = {
    id: `MSG-${Date.now()}-U`,
    role: 'user',
    content: message.trim(),
    timestamp: new Date().toISOString()
  };
  store.addChatMessage(projectId, userMsg, targetDbKey);

  // 2. Fetch project context with robust multi-tiered resolution
  let adapter = AdapterFactory.getActiveAdapter(projectId);
  const project = store.getProjectById(projectId);

  if (!adapter && project?.connectionConfig) {
    try {
      adapter = await AdapterFactory.createAdapter(projectId, project.connectionConfig);
    } catch (e) {
      console.warn('Auto-reconnecting adapter for chat:', e);
    }
  }

  let schema;
  if (adapter) {
    try {
      schema = await adapter.extractSchema();
    } catch (e) {
      console.warn('Schema extraction from adapter failed:', e);
    }
  }

  const reviews = store.getReviews(projectId);
  const latestReview = reviews[0];
  if (!schema && latestReview?.schemaSnapshot) {
    schema = latestReview.schemaSnapshot;
  }

  // Fallback to project database sample if adapter is not yet connected
  if (!schema) {
    const sample = SAMPLE_DATABASES.find(s => s.id === project?.connectionConfig?.sampleId) || SAMPLE_DATABASES[0];
    try {
      const fallbackAdapter = new SQLiteAdapter({ rawSql: sample.schemaSql, databaseName: sample.name });
      await fallbackAdapter.connect();
      schema = await fallbackAdapter.extractSchema();
    } catch (err) {
      console.warn('Fallback schema load error:', err);
    }
  }

  const healthScore = latestReview?.healthScore;
  const findings = latestReview?.findings || [];
  const history = store.getChatMessages(projectId, targetDbKey);

  try {
    const assistantMsg = await AIService.chat({
      projectId,
      userMessage: message.trim(),
      schema,
      healthScore,
      findings,
      chatHistory: history
    });

    store.addChatMessage(projectId, assistantMsg, targetDbKey);
    res.json({
      success: true,
      message: assistantMsg,
      databaseKey: targetDbKey,
      availableDatabases: store.getChatDatabases(projectId)
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'AI_CHAT_ERROR', message: err.message || 'Chat service error' } });
  }
});

// Explain My Database
router.post('/projects/:id/explain', authenticate, requireProjectOwner, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const projectId = req.params.id;
  const adapter = AdapterFactory.getActiveAdapter(projectId);

  if (!adapter) {
    res.status(400).json({ success: false, error: { code: 'NO_CONNECTION', message: 'Database is not connected.' } });
    return;
  }

  try {
    const schema = await adapter.extractSchema();
    const result = await AIService.explainDatabase(schema);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'EXPLAIN_FAILED', message: err.message || 'Failed to explain database' } });
  }
});

export default router;
