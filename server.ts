import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './server/routes/authRoutes.js';
import projectRoutes from './server/routes/projectRoutes.js';
import databaseRoutes from './server/routes/databaseRoutes.js';
import reviewRoutes from './server/routes/reviewRoutes.js';
import findingRoutes from './server/routes/findingRoutes.js';
import recommendationRoutes from './server/routes/recommendationRoutes.js';
import sqlRoutes from './server/routes/sqlRoutes.js';
import chatRoutes from './server/routes/chatRoutes.js';
import reportRoutes from './server/routes/reportRoutes.js';
import settingsRoutes from './server/routes/settingsRoutes.js';

const PORT = 3000;

async function startServer() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '200mb' }));
  app.use(express.urlencoded({ extended: true, limit: '200mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'AI Powered Database Reviewer',
      timestamp: new Date().toISOString()
    });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api', databaseRoutes);
  app.use('/api', reviewRoutes);
  app.use('/api', findingRoutes);
  app.use('/api', recommendationRoutes);
  app.use('/api', sqlRoutes);
  app.use('/api', chatRoutes);
  app.use('/api', reportRoutes);
  app.use('/api/settings', settingsRoutes);

  // Error handling middleware
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled Server Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  });

  // Vite middleware for development / static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Powered Database Reviewer server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
