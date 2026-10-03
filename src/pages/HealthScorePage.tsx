import React from 'react';
import {
  Activity,
  Shield,
  Layers,
  Zap,
  CheckCircle,
  GitFork,
  Wrench,
  HelpCircle,
  Calculator
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';

interface HealthScorePageProps {
  onNavigateToTab: (tab: string) => void;
}

export const HealthScorePage: React.FC<HealthScorePageProps> = ({ onNavigateToTab }) => {
  const { latestReview } = useProject();

  const score = latestReview?.healthScore;

  if (!score) {
    return (
      <div className="p-12 text-center text-slate-500 space-y-3">
        <Activity className="w-12 h-12 mx-auto text-slate-700" />
        <h3 className="text-base font-semibold text-slate-300">Health Score Not Calculated</h3>
        <p className="text-xs">Run a review on your active database first to generate the architectural score.</p>
      </div>
    );
  }

  const categoryDetails = [
    {
      key: 'security',
      label: 'Security & Access Control',
      score: score.categories.security,
      weight: '25%',
      icon: Shield,
      description: 'Evaluates plaintext credentials, PCI-DSS card verification value exposures, unmasked PII, and sensitive contact attributes.'
    },
    {
      key: 'structure',
      label: 'Structure & Normalization',
      score: score.categories.structure,
      weight: '20%',
      icon: Layers,
      description: 'Tests 1NF (multi-valued list attributes), 2NF/3NF (derived calculated columns), and primary key uniqueness.'
    },
    {
      key: 'performance',
      label: 'Query Performance & Indexing',
      score: score.categories.performance,
      weight: '20%',
      icon: Zap,
      description: 'Verifies secondary B-tree indexes covering foreign keys, unindexed joins, redundant duplicate indexes, and wide text storage.'
    },
    {
      key: 'dataQuality',
      label: 'Data Quality & Integrity',
      score: score.categories.dataQuality,
      weight: '15%',
      icon: CheckCircle,
      description: 'Audits sample records for high NULL rates (>40%), malformed email addresses, and phone format inconsistencies.'
    },
    {
      key: 'relationships',
      label: 'Referential Integrity',
      score: score.categories.relationships,
      weight: '10%',
      icon: GitFork,
      description: 'Detects orphaned references, missing FOREIGN KEY constraints, and verifies entity relationship cardinality.'
    },
    {
      key: 'maintainability',
      label: 'Naming & Schema Debt',
      score: score.categories.maintainability,
      weight: '10%',
      icon: Wrench,
      description: 'Evaluates casing uniformity (snake_case vs camelCase) and single-letter cryptic column identifiers.'
    }
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Database Health Score</h1>
        <p className="text-xs text-slate-400 mt-1">
          Deterministic 0-100 quantitative architectural assessment
        </p>
      </div>

      {/* Main Score Hero */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-28 h-28 rounded-2xl bg-sky-500/10 border-2 border-sky-500/40 flex flex-col items-center justify-center text-sky-400 font-mono shadow-xl shadow-sky-500/10">
            <span className="text-3xl font-extrabold">{score.overall}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">OUT OF 100</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">Rating Grade</span>
              <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 font-mono text-xs font-bold border border-sky-800">
                {score.grade}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-100 mt-1">Overall System Quality</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-md leading-relaxed">{score.explanation}</p>
          </div>
        </div>

        <button
          onClick={() => onNavigateToTab('recommendations')}
          className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors shadow-lg shrink-0"
        >
          View Remediation Plan
        </button>
      </div>

      {/* Weighting Formula Breakdown */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Calculator className="w-4 h-4 text-sky-400" />
          <span>Mathematical Weighting Formula (Viva / Examination Defense)</span>
        </div>
        <p className="text-xs text-slate-400 font-mono leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-800">
          Overall Score = (Security &times; 0.25) + (Structure &times; 0.20) + (Performance &times; 0.20) + (Data Quality &times; 0.15) + (Relationships &times; 0.10) + (Maintainability &times; 0.10)
        </p>
        <p className="text-[11px] text-slate-500">
          Each category begins at a baseline of 100 points. Penalties are deducted deterministically per finding: CRITICAL (-20 pts), HIGH (-10 pts), MEDIUM (-5 pts), LOW (-2 pts).
        </p>
      </div>

      {/* 6 Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categoryDetails.map(cat => {
          const Icon = cat.icon;
          const numScore = cat.score;
          const colorClass =
            numScore >= 85 ? 'text-emerald-400' : numScore >= 70 ? 'text-amber-400' : 'text-rose-400';
          const bgBarClass =
            numScore >= 85 ? 'bg-emerald-500' : numScore >= 70 ? 'bg-amber-500' : 'bg-rose-500';

          return (
            <div key={cat.key} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-slate-800 text-sky-400 border border-slate-700/50">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-200 text-xs">{cat.label}</h3>
                    <span className="text-[10px] text-slate-500 font-mono">Weight: {cat.weight}</span>
                  </div>
                </div>
                <div className={`text-xl font-bold font-mono ${colorClass}`}>{numScore}/100</div>
              </div>

              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${bgBarClass}`} style={{ width: `${numScore}%` }}></div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">{cat.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
