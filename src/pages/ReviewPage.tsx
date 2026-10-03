import React from 'react';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Activity,
  ArrowRight,
  ShieldCheck,
  Zap,
  Layers,
  Database
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';
import { SeverityBadge } from '../components/SeverityBadge.js';

interface ReviewPageProps {
  onNavigateToTab: (tab: string) => void;
  onTriggerReview: () => void;
  reviewing: boolean;
}

export const ReviewPage: React.FC<ReviewPageProps> = ({
  onNavigateToTab,
  onTriggerReview,
  reviewing
}) => {
  const { activeProject, latestReview } = useProject();

  const score = latestReview?.healthScore;
  const findings = latestReview?.findings || [];
  const criticalFindings = findings.filter(f => f.severity === 'CRITICAL');
  const highFindings = findings.filter(f => f.severity === 'HIGH');

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-400 uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5" />
            Automated Audit & Vulnerability Engine
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mt-1">Full Database Inspection</h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Executes deterministic AST analysis across security (PII/passwords), performance (missing indexes), normalization (1NF/2NF/3NF), data quality (NULLs/regex), and relationship integrity.
          </p>
        </div>

        <button
          onClick={onTriggerReview}
          disabled={reviewing || activeProject?.connectionStatus !== 'CONNECTED'}
          className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-xl shadow-sky-600/20 flex items-center justify-center gap-2 shrink-0"
        >
          <Search className={`w-4 h-4 ${reviewing ? 'animate-spin' : ''}`} />
          <span>{reviewing ? 'Auditing Schema & Profiling...' : 'Execute Comprehensive Review'}</span>
        </button>
      </div>

      {/* Execution Status / Progress state */}
      {reviewing && (
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-sky-500/30 space-y-4 animate-pulse">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-sky-400">Review Execution in Progress</span>
            <span className="font-mono text-slate-400">Step 3 of 5: Running AST Security & Normalization Analyzers</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-sky-500 rounded-full w-2/3"></div>
          </div>
        </div>
      )}

      {/* Latest Review Results */}
      {latestReview ? (
        <div className="space-y-6">
          {/* Executive Summary Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <span className="text-[11px] font-mono text-slate-500 uppercase">Review Run: {latestReview.id}</span>
                <h3 className="text-base font-bold text-slate-100 mt-0.5">Audit Summary</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Conducted on {new Date(latestReview.createdAt).toLocaleString()} &bull; Database: {latestReview.schemaSnapshot.databaseName}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-slate-400">Health Rating</div>
                  <div className="text-2xl font-bold font-mono text-sky-400">{score?.overall}/100</div>
                </div>
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center font-bold text-lg text-sky-400 font-mono">
                  {score?.grade}
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 mt-4 leading-relaxed bg-slate-950/80 p-3.5 rounded-xl border border-slate-800/80">
              {latestReview.summary}
            </p>

            {/* Quick Navigation Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div
                onClick={() => onNavigateToTab('health')}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors group"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Category Scores</span>
                  <Activity className="w-4 h-4 text-sky-400" />
                </div>
                <div className="text-lg font-bold text-slate-200 mt-2 font-mono">6 Dimensions</div>
                <div className="text-xs text-sky-400 mt-1 flex items-center gap-1 group-hover:underline">
                  Inspect score breakdown <ArrowRight className="w-3 h-3" />
                </div>
              </div>

              <div
                onClick={() => onNavigateToTab('findings')}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors group"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Total Vulnerabilities</span>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-lg font-bold text-slate-200 mt-2 font-mono">
                  {findings.length} Findings ({criticalFindings.length} Critical)
                </div>
                <div className="text-xs text-sky-400 mt-1 flex items-center gap-1 group-hover:underline">
                  View full findings list <ArrowRight className="w-3 h-3" />
                </div>
              </div>

              <div
                onClick={() => onNavigateToTab('recommendations')}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors group"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Approval Center</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-lg font-bold text-slate-200 mt-2 font-mono">Actionable Fixes</div>
                <div className="text-xs text-sky-400 mt-1 flex items-center gap-1 group-hover:underline">
                  Review & approve changes <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <Database className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-300">No Review Performed Yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Click &ldquo;Execute Comprehensive Review&rdquo; above to analyze the connected database.
          </p>
        </div>
      )}
    </div>
  );
};
