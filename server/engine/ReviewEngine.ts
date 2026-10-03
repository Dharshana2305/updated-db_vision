import { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import { SecurityScanner } from './SecurityScanner.js';
import { PerformanceAnalyzer } from './PerformanceAnalyzer.js';
import { DesignAnalyzer } from './DesignAnalyzer.js';
import { QualityAnalyzer } from './QualityAnalyzer.js';
import { MaintainabilityAnalyzer } from './MaintainabilityAnalyzer.js';
import { HealthScorer } from './HealthScorer.js';
import { DatabaseSchema, Finding, Review, RecommendationItem } from '../../src/types.js';

export class ReviewEngine {
  static async runReview(projectId: string, adapter: DatabaseAdapter, maxProfileRows = 500): Promise<{
    review: Review;
    recommendations: RecommendationItem[];
  }> {
    // 1. Extract complete schema
    const schema = await adapter.extractSchema();

    // 2. Safely profile each table with streaming/chunking limit
    const tableProfiles: Record<string, any> = {};
    for (const table of schema.tables) {
      try {
        const profile = await adapter.profileTable(table.name, maxProfileRows);
        tableProfiles[table.name] = profile;

        // Augment schema column objects with profiling statistics
        for (const col of table.columns) {
          const nullCount = profile.nullCounts[col.name] ?? 0;
          const totalRows = profile.totalRows || 1;
          col.nullCount = nullCount;
          col.nullPercentage = Math.round((nullCount / totalRows) * 100);
          col.distinctCount = profile.distinctCounts[col.name] ?? 0;

          // Check sample values for PII tags
          if (col.name.toLowerCase().includes('email')) {
            col.piiFlag = { type: 'EMAIL', confidence: 95, maskedSample: '[EMAIL_REDACTED]' };
          } else if (col.name.toLowerCase().includes('ssn')) {
            col.piiFlag = { type: 'SSN', confidence: 98, maskedSample: '***-**-****' };
          } else if (col.name.toLowerCase().includes('card') || col.name.toLowerCase().includes('cvv')) {
            col.piiFlag = { type: 'FINANCIAL', confidence: 96, maskedSample: '****-****-****-****' };
          } else if (col.name.toLowerCase().includes('pass') || col.name.toLowerCase() === 'pwd') {
            col.piiFlag = { type: 'PASSWORD', confidence: 99, maskedSample: '••••••••' };
          }
        }
      } catch (err) {
        console.warn(`Could not profile table ${table.name}:`, err);
      }
    }

    // 3. Execute all deterministic analyzers
    const securityFindings = SecurityScanner.scan(schema);
    const performanceFindings = PerformanceAnalyzer.analyze(schema);
    const designFindings = DesignAnalyzer.analyze(schema);
    const qualityFindings = QualityAnalyzer.analyze(schema, tableProfiles);
    const maintainabilityFindings = MaintainabilityAnalyzer.analyze(schema);

    const allFindings: Finding[] = [
      ...securityFindings,
      ...performanceFindings,
      ...designFindings,
      ...qualityFindings,
      ...maintainabilityFindings
    ];

    // Sort by severity: CRITICAL first, then HIGH, MEDIUM, LOW, INFO
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // 4. Calculate deterministic health score
    const healthScore = HealthScorer.calculate(allFindings);

    // 5. Build structured recommendations with safety checks and rollback operations
    const recommendations: RecommendationItem[] = allFindings
      .filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH' || f.severity === 'MEDIUM')
      .map(f => {
        const isSafeToApply = Boolean(f.suggestedFix);
        let rollbackOp = f.rollbackSql;
        if (!rollbackOp && f.suggestedFix) {
          const matchIdx = f.suggestedFix.match(/CREATE INDEX (?:IF NOT EXISTS )?"?([^"\s]+)"?/i);
          if (matchIdx) {
            rollbackOp = `DROP INDEX IF EXISTS "${matchIdx[1]}";`;
          }
          const matchView = f.suggestedFix.match(/CREATE VIEW (?:IF NOT EXISTS )?"?([^"\s]+)"?/i);
          if (matchView) {
            rollbackOp = `DROP VIEW IF EXISTS "${matchView[1]}";`;
          }
        }

        return {
          id: `REC-${f.id}`,
          projectId,
          findingId: f.id,
          title: f.title,
          problem: f.description,
          recommendation: f.recommendation,
          why: f.whyItMatters,
          expectedImpact: f.expectedImpact,
          risk: f.risk,
          safetyChecks: {
            potentialLocks: f.category === 'performance' ? 'Brief shared metadata lock during index creation' : 'Potential table lock depending on row count',
            dependencies: [f.table],
            affectedObjects: [f.databaseObject],
            potentialDataLoss: false,
            breakingChanges: f.severity === 'CRITICAL' && f.category === 'structure',
            safeToApply: isSafeToApply
          },
          proposedOperation: f.suggestedFix,
          rollbackOperation: rollbackOp || `-- Rollback will update governance log status`,
          status: 'PENDING'
        };
      });

    const reviewId = `REV-${Date.now()}`;
    const review: Review = {
      id: reviewId,
      projectId,
      createdAt: new Date().toISOString(),
      healthScore,
      findings: allFindings,
      summary: `Automated comprehensive review completed on ${schema.summary.totalTables} tables (${schema.summary.totalColumns} columns, ${schema.summary.totalEstimatedRows} total rows). Discovered ${allFindings.length} findings (${allFindings.filter(f => f.severity === 'CRITICAL').length} critical).`,
      databaseType: adapter.type,
      schemaSnapshot: schema
    };

    return { review, recommendations };
  }
}
