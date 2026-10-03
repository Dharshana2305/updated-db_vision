import { Finding, HealthScore, FindingSeverity, FindingCategory } from '../../src/types.js';

export class HealthScorer {
  /**
   * Deterministic Health Scoring Algorithm (0 - 100):
   * 
   * Each category starts at 100 points:
   * - CRITICAL issue: -25 points
   * - HIGH issue:     -15 points
   * - MEDIUM issue:   -8 points
   * - LOW issue:      -3 points
   * - INFO issue:     -0 points
   * 
   * Floor is 0, ceiling is 100.
   * 
   * Overall Score is a weighted average:
   * - Structure:       20%
   * - Security:        25%
   * - Performance:     20%
   * - Data Quality:    15%
   * - Relationships:   10%
   * - Maintainability: 10%
   */
  static calculate(findings: Finding[]): HealthScore {
    const weights: Record<FindingCategory, number> = {
      security: 0.25,
      structure: 0.20,
      performance: 0.20,
      quality: 0.15,
      relationships: 0.10,
      maintainability: 0.10
    };

    const penalties: Record<FindingSeverity, number> = {
      CRITICAL: 25,
      HIGH: 15,
      MEDIUM: 8,
      LOW: 3,
      INFO: 0
    };

    const categoryScores: Record<FindingCategory, number> = {
      structure: 100,
      quality: 100,
      performance: 100,
      security: 100,
      relationships: 100,
      maintainability: 100
    };

    const categoryIssues: Record<FindingCategory, { total: number; critical: number }> = {
      structure: { total: 0, critical: 0 },
      quality: { total: 0, critical: 0 },
      performance: { total: 0, critical: 0 },
      security: { total: 0, critical: 0 },
      relationships: { total: 0, critical: 0 },
      maintainability: { total: 0, critical: 0 }
    };

    // Calculate deductions
    findings.forEach(f => {
      const cat = f.category;
      if (categoryScores[cat] !== undefined) {
        categoryIssues[cat].total++;
        if (f.severity === 'CRITICAL') categoryIssues[cat].critical++;
        const penalty = penalties[f.severity] || 0;
        categoryScores[cat] = Math.max(0, categoryScores[cat] - penalty);
      }
    });

    // Weighted overall score
    let weightedSum = 0;
    for (const [cat, weight] of Object.entries(weights)) {
      const score = categoryScores[cat as FindingCategory];
      weightedSum += score * weight;
    }
    const overall = Math.round(weightedSum);

    const categoryBreakdown: HealthScore['categoryBreakdown'] = {
      structure: {
        score: categoryScores.structure,
        issuesCount: categoryIssues.structure.total,
        criticalCount: categoryIssues.structure.critical,
        weight: weights.structure,
        explanation: `${categoryIssues.structure.total} issues detected (${categoryIssues.structure.critical} critical) affecting table structures, keys, and schemas.`
      },
      dataQuality: {
        score: categoryScores.quality,
        issuesCount: categoryIssues.quality.total,
        criticalCount: categoryIssues.quality.critical,
        weight: weights.quality,
        explanation: `${categoryIssues.quality.total} data-level anomalies detected including NULL spikes and malformed data.`
      },
      performance: {
        score: categoryScores.performance,
        issuesCount: categoryIssues.performance.total,
        criticalCount: categoryIssues.performance.critical,
        weight: weights.performance,
        explanation: `${categoryIssues.performance.total} query execution or indexing bottlenecks identified.`
      },
      security: {
        score: categoryScores.security,
        issuesCount: categoryIssues.security.total,
        criticalCount: categoryIssues.security.critical,
        weight: weights.security,
        explanation: `${categoryIssues.security.total} vulnerabilities flagged, including PII exposure and plaintext credentials.`
      },
      relationships: {
        score: categoryScores.relationships,
        issuesCount: categoryIssues.relationships.total,
        criticalCount: categoryIssues.relationships.critical,
        weight: weights.relationships,
        explanation: `${categoryIssues.relationships.total} relational integrity or orphaned foreign key risks detected.`
      },
      maintainability: {
        score: categoryScores.maintainability,
        issuesCount: categoryIssues.maintainability.total,
        criticalCount: categoryIssues.maintainability.critical,
        weight: weights.maintainability,
        explanation: `${categoryIssues.maintainability.total} convention and readability debt points documented.`
      }
    };

    // Overall summary text
    let grade = 'A';
    if (overall < 60) grade = 'F - Critical Action Required';
    else if (overall < 70) grade = 'D - Poor';
    else if (overall < 80) grade = 'C - Needs Improvement';
    else if (overall < 90) grade = 'B - Good';
    else grade = 'A - Excellent';

    const explanation = `Overall Database Health is ${overall}/100 (Grade ${grade}). The evaluation is computed using deterministic multi-criteria analysis across 6 standard dimensions: Security (25%), Structure (20%), Performance (20%), Data Quality (15%), Relationships (10%), and Maintainability (10%).`;

    return {
      overall,
      categories: {
        structure: categoryScores.structure,
        dataQuality: categoryScores.quality,
        performance: categoryScores.performance,
        security: categoryScores.security,
        relationships: categoryScores.relationships,
        maintainability: categoryScores.maintainability
      },
      categoryBreakdown,
      explanation,
      calculatedAt: new Date().toISOString()
    };
  }
}
