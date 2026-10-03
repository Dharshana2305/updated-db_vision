import { Router, Response } from 'express';
import { store } from '../db/store.js';
import { AuthenticatedRequest, authenticate, requireProjectOwner } from '../middleware/auth.js';

const router = Router();

// Generate professional printable HTML report (Protected with Ownership Check)
router.get('/projects/:id/report/html', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const projectId = req.params.id;
  const project = store.getProjectById(projectId, req.user!.id);
  if (!project) {
    res.status(404).send('Project not found');
    return;
  }

  const reviews = store.getReviews(projectId);
  const latestReview = reviews[0];

  if (!latestReview) {
    res.status(400).send('No review available for this project. Please run an automated review first.');
    return;
  }

  const score = latestReview.healthScore;
  const findings = latestReview.findings;
  const schema = latestReview.schemaSnapshot;
  const recommendations = store.getRecommendations(projectId);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Database Audit & Review Report - ${project.name}</title>
  <style>
    @media print {
      body { font-size: 12pt; color: #000; background: #fff; }
      .page-break { page-break-before: always; }
      .no-print { display: none; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #1e293b;
      background: #f8fafc;
      margin: 0;
      padding: 40px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: #fff;
      padding: 50px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    }
    .header {
      border-bottom: 3px solid #0284c7;
      padding-bottom: 25px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .title { font-size: 28px; font-weight: 800; color: #0f172a; margin: 0 0 8px 0; }
    .subtitle { color: #64748b; font-size: 14px; margin: 0; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-critical { background: #fee2e2; color: #991b1b; }
    .badge-high { background: #ffedd5; color: #9a3412; }
    .badge-medium { background: #fef9c3; color: #854d0e; }
    .badge-low { background: #e0f2fe; color: #075985; }
    .score-card {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 35px;
      display: flex;
      align-items: center;
      gap: 30px;
    }
    .score-circle {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: #0284c7;
      color: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      font-weight: 800;
    }
    .score-circle span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; width: 100%; }
    .grid-item { background: #fff; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
    .grid-label { font-size: 12px; color: #64748b; margin-bottom: 4px; }
    .grid-value { font-size: 18px; font-weight: 700; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 30px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    th { background: #f8fafc; font-weight: 600; color: #475569; }
    code { font-family: "Fira Code", monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #0369a1; }
    .print-btn {
      background: #0284c7;
      color: #fff;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: flex-end;">
      <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    </div>

    <div class="header">
      <div>
        <h1 class="title">Database Review & Optimization Audit</h1>
        <p class="subtitle">Architectural Audit &bull; Generated: ${new Date().toLocaleDateString()}</p>
        <p class="subtitle">Project Workspace: <strong>${project.name}</strong> &bull; Database: <strong>${schema.databaseName} (${schema.databaseType.toUpperCase()})</strong></p>
      </div>
      <div style="text-align: right;">
        <span class="badge" style="background:#e0e7ff; color:#3730a3;">Version 1.0</span>
      </div>
    </div>

    <div class="score-card">
      <div class="score-circle">
        ${score.overall}
        <span>Score</span>
      </div>
      <div class="grid">
        <div class="grid-item">
          <div class="grid-label">Security</div>
          <div class="grid-value">${score.categories.security}/100</div>
        </div>
        <div class="grid-item">
          <div class="grid-label">Structure</div>
          <div class="grid-value">${score.categories.structure}/100</div>
        </div>
        <div class="grid-item">
          <div class="grid-label">Performance</div>
          <div class="grid-value">${score.categories.performance}/100</div>
        </div>
        <div class="grid-item">
          <div class="grid-label">Data Quality</div>
          <div class="grid-value">${score.categories.dataQuality}/100</div>
        </div>
        <div class="grid-item">
          <div class="grid-label">Relationships</div>
          <div class="grid-value">${score.categories.relationships}/100</div>
        </div>
        <div class="grid-item">
          <div class="grid-label">Maintainability</div>
          <div class="grid-value">${score.categories.maintainability}/100</div>
        </div>
      </div>
    </div>

    <h3>Executive Evaluation</h3>
    <p style="color: #475569; font-size: 14px;">${score.explanation}</p>

    <h3>Table Inventory</h3>
    <table>
      <thead>
        <tr>
          <th>Table / Collection</th>
          <th>Type</th>
          <th>Rows</th>
          <th>Columns</th>
          <th>Primary Key</th>
          <th>Foreign Keys</th>
        </tr>
      </thead>
      <tbody>
        ${schema.tables.map(t => `
          <tr>
            <td><strong>${t.name}</strong></td>
            <td>${t.type}</td>
            <td>${t.rowCount}</td>
            <td>${t.columns.length}</td>
            <td><code>${t.primaryKey.join(', ') || 'None'}</code></td>
            <td>${t.foreignKeys.length} relation(s)</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="page-break"></div>

    <h3>Detailed Findings (${findings.length} Issues Identified)</h3>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Severity</th>
          <th>Category</th>
          <th>Object</th>
          <th>Description & Recommendation</th>
        </tr>
      </thead>
      <tbody>
        ${findings.map(f => `
          <tr>
            <td><code>${f.id}</code></td>
            <td><span class="badge badge-${f.severity.toLowerCase()}">${f.severity}</span></td>
            <td style="text-transform: capitalize;">${f.category}</td>
            <td><code>${f.databaseObject}</code></td>
            <td>
              <strong>${f.title}</strong><br>
              <span style="color: #64748b;">${f.description}</span><br>
              <em style="color: #0284c7;">Rec: ${f.recommendation}</em>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h3>Actionable Recommendations & Rollbacks</h3>
    <table>
      <thead>
        <tr>
          <th>Recommendation</th>
          <th>Risk</th>
          <th>Proposed Operation</th>
          <th>Rollback Operation</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${recommendations.map(r => `
          <tr>
            <td><strong>${r.title}</strong><br><small style="color:#64748b;">${r.why}</small></td>
            <td><span class="badge" style="background:#f1f5f9; color:#475569;">${r.risk}</span></td>
            <td><code>${r.proposedOperation}</code></td>
            <td><code>${r.rollbackOperation}</code></td>
            <td><strong>${r.status}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="margin-top: 50px; border-top: 1px solid #cbd5e1; padding-top: 20px; font-size: 12px; color: #94a3b8; text-align: center;">
      AI Powered Database Reviewer &bull; Academic & Enterprise Platform &bull; Year 2026
    </div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// JSON Export (Protected with Ownership Check)
router.get('/projects/:id/report/export/json', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const projectId = req.params.id;
  const project = store.getProjectById(projectId, req.user!.id);
  const reviews = store.getReviews(projectId);
  const recommendations = store.getRecommendations(projectId);
  const auditLogs = store.getAuditLogs(projectId);

  // Strip sensitive fields
  const safeProject = project ? {
    ...project,
    connectionConfig: project.connectionConfig ? {
      ...project.connectionConfig,
      password: undefined
    } : undefined
  } : undefined;

  res.setHeader('Content-Disposition', `attachment; filename="${project?.name || 'database'}-audit-report.json"`);
  res.json({ success: true, project: safeProject, latestReview: reviews[0], allReviews: reviews, recommendations, auditLogs });
});

// CSV Export of Findings (Protected with Ownership Check)
router.get('/projects/:id/report/export/csv', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const projectId = req.params.id;
  const findings = store.getFindings(projectId);

  const headers = ['Finding ID', 'Title', 'Severity', 'Category', 'Database Object', 'Confidence', 'Risk', 'Description', 'Recommendation', 'Suggested Fix'];
  const rows = findings.map(f => [
    `"${f.id}"`,
    `"${f.title.replace(/"/g, '""')}"`,
    `"${f.severity}"`,
    `"${f.category}"`,
    `"${f.databaseObject}"`,
    `"${f.confidence}%"`,
    `"${f.risk}"`,
    `"${f.description.replace(/"/g, '""')}"`,
    `"${f.recommendation.replace(/"/g, '""')}"`,
    `"${(f.suggestedFix || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="database-findings.csv"');
  res.send(csvContent);
});

// SQL Migration Script Export of all proposed fixes (Protected with Ownership Check)
router.get('/projects/:id/report/export/sql', authenticate, requireProjectOwner, (req: AuthenticatedRequest, res: Response): void => {
  const projectId = req.params.id;
  const recommendations = store.getRecommendations(projectId);

  const header = `-- =======================================================
-- AI POWERED DATABASE REVIEWER: AUTOMATED REMEDIATION SCRIPT
-- Generated for Project: ${projectId}
-- Timestamp: ${new Date().toISOString()}
-- =======================================================\n\n`;

  const body = recommendations
    .filter(r => r.proposedOperation && !r.proposedOperation.startsWith('--'))
    .map(r => `-- Finding: ${r.title}\n-- Risk: ${r.risk}\n${r.proposedOperation}\n`)
    .join('\n');

  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', 'attachment; filename="remediation-script.sql"');
  res.send(header + body);
});

export default router;
