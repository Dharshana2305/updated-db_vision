import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { AuthenticatedRequest, authenticate, requireProjectOwner } from '../middleware/auth.js';
import { Project, DatabaseConnectionConfig } from '../../src/types.js';
import { AdapterFactory } from '../adapters/AdapterFactory.js';
import { SAMPLE_DATABASES } from '../adapters/SampleDatabases.js';
import { ReviewEngine } from '../engine/ReviewEngine.js';

const router = Router();

// Get all projects for current user
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  let projects = store.getProjects(userId);

  if (projects.length === 0) {
    const sample = SAMPLE_DATABASES[0];
    const defaultProject: Project = {
      id: `PRJ-${Date.now()}`,
      userId,
      name: 'Retail & E-Commerce Audit',
      description: 'Pre-configured demonstration database featuring retail transactions, customer accounts, and real-world optimization challenges.',
      databaseType: 'sqlite',
      connectionStatus: 'CONNECTED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const config: DatabaseConnectionConfig = {
      type: 'sqlite',
      isSample: true,
      sampleId: sample.id,
      name: sample.name
    };
    defaultProject.connectionConfig = config;

    store.createProject(defaultProject);

    try {
      const adapter = await AdapterFactory.createAdapter(defaultProject.id, config);
      await adapter.testConnection();

      // Seed initial review
      const settings = store.getSettings();
      const { review, recommendations } = await ReviewEngine.runReview(defaultProject.id, adapter, settings.maxProfileRows);

      // Create baseline review
      const baselineReview = {
        ...JSON.parse(JSON.stringify(review)),
        id: `REV-BASELINE-${Date.now()}`,
        createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        healthScore: {
          ...review.healthScore,
          overall: 38,
          grade: 'F'
        },
        summary: 'Initial scan baseline before indexing and security hardening.'
      };

      store.createReview(baselineReview);
      store.createReview(review);
      store.saveRecommendations(defaultProject.id, recommendations);
      store.updateProject(defaultProject.id, {
        lastReviewId: review.id,
        latestHealthScore: review.healthScore,
        totalFindings: review.findings.length,
        criticalFindings: review.findings.filter(f => f.severity === 'CRITICAL').length
      });
    } catch (e) {
      console.error('Error auto-seeding starter project review:', e);
    }

    projects = store.getProjects(userId);
  }

  res.json({ success: true, projects });
});

// Create project
router.post('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, description, databaseType } = req.body;

    if (!name) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Project name is required.' } });
      return;
    }

    const newProject: Project = {
      id: `PRJ-${Date.now()}`,
      userId,
      name: name.trim(),
      description: (description || '').trim(),
      databaseType: databaseType || 'sqlite',
      connectionStatus: 'DISCONNECTED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    store.createProject(newProject);
    res.status(201).json({ success: true, project: newProject });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'PROJECT_CREATE_FAILED', message: err.message || 'Failed to create project' } });
  }
});

// Get project details (Protected with Ownership Check)
router.get('/:id', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const project = store.getProjectById(req.params.id, req.user!.id);
  if (!project) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found.' } });
    return;
  }
  res.json({ success: true, project });
});

// Delete project (Protected with Ownership Check)
router.delete('/:id', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const success = store.deleteProject(req.params.id, req.user!.id);
  if (!success) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found or could not be deleted.' } });
    return;
  }
  AdapterFactory.removeAdapter(req.params.id);
  res.json({ success: true, message: 'Project removed successfully.' });
});

export default router;
