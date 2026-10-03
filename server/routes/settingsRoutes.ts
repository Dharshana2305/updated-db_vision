import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { AuthenticatedRequest, authenticate, restrictGuest } from '../middleware/auth.js';
import { OllamaClient } from '../ai/OllamaClient.js';
import { GeminiClient } from '../ai/GeminiClient.js';

const router = Router();

// Get settings
router.get('/', authenticate, (_req: AuthenticatedRequest, res: Response): void => {
  const settings = store.getSettings();
  res.json({ success: true, settings });
});

// Update settings (Restricted for Guest Users)
router.patch('/', authenticate, restrictGuest, (req: AuthenticatedRequest, res: Response): void => {
  const updates = req.body;
  const updated = store.updateSettings(updates);
  res.json({ success: true, settings: updated });
});

// Test Ollama endpoint
router.post('/test-ollama', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { baseUrl } = req.body;
  const settings = store.getSettings();
  const url = baseUrl || settings.ollamaBaseUrl;

  try {
    const health = await OllamaClient.checkHealth(url);
    res.json({ success: true, health });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'OLLAMA_CHECK_FAILED', message: err.message || 'Error checking Ollama' } });
  }
});

// System info for diagnostics
router.get('/system-info', authenticate, (_req: AuthenticatedRequest, res: Response): void => {
  res.json({
    success: true,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    uptimeSeconds: Math.round(process.uptime()),
    memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    geminiAvailable: GeminiClient.isAvailable(),
    environment: process.env.NODE_ENV || 'development'
  });
});

export default router;
