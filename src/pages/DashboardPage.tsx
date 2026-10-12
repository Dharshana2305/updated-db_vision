import React from 'react';
import {
  Activity,
  AlertTriangle,
  Database,
  ArrowRight,
  Search,
  Sparkles,
  GitGraph,
  Terminal,
  ShieldAlert,
  CheckCircle2,
  Cpu
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';
import { StatCard } from '../components/StatCard.js';
import { SeverityBadge } from '../components/SeverityBadge.js';

interface DashboardPageProps {
  onNavigateToTab: (tab: string) => void;
  onTriggerReview: () => void;
  reviewing: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigateToTab,
  onTriggerReview,
  reviewing
}) => {
  const { activeProject, schema, latestReview, recommendations } = useProject();

  const score = latestReview?.healthScore;
  const findings = latestReview?.findings || [];
  const criticalCount = findings.filter(f => f.severity === 'CRITICAL').length;
  const highCount = findings.filter(f => f.severity === 'HIGH').length;
  const pendingApprovals = recommendations.filter(r => r.status === 'PENDING').length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner: Project Title & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">Active Workspace</span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-xs text-slate-400 font-mono">{activeProject?.databaseType.toUpperCase()}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mt-1">{activeProject?.name || 'No Project Selected'}</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {activeProject?.description || 'AI-assisted relational schema quality and security review'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="btn-trigger-review"
            onClick={onTriggerReview}
            disabled={reviewing || activeProject?.connectionStatus !== 'CONNECTED'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition-all shadow-lg shadow-sky-600/20 cursor-pointer"
          >
            <Search className={`w-4 h-4 ${reviewing ? 'animate-spin' : ''}`} />
            <span>{reviewing ? 'Executing Review...' : 'Run Full Review'}</span>
          </button>
          <button
            onClick={() => onNavigateToTab('chat')}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors border border-slate-700 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-sky-400" />
            <span>AI Copilot</span>
          </button>
        </div>
      </div>

      {/* Disconnected Workspace Banner if not connected */}
      {activeProject && activeProject.connectionStatus !== 'CONNECTED' && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-amber-100">
                Workspace is not connected to a database
              </div>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                Connect a file-based database (.sql, .db, .sqlite, .sqlite3) or a live server database to unlock automated schema audits, ER diagrams, and flaw remediation.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToTab('connection')}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shrink-0 transition-colors shadow-md cursor-pointer flex items-center gap-1.5"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Connect Database Now</span>
          </button>
        </div>
      )}

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          id="stat-health-score"
          title="Overall Health Score"
          value={score ? `${score.overall}/100` : '--'}
          subtitle={score ? `Rated: ${score.grade}` : 'Audit not performed'}
          icon={<Activity className="w-5 h-5" />}
          accentColor={
            score && score.overall < 70
              ? 'border-rose-500/40'
              : score && score.overall < 85
              ? 'border-amber-500/40'
              : 'border-emerald-500/40'
          }
          onClick={() => onNavigateToTab('health')}
        />

        <StatCard
          id="stat-critical-findings"
          title="Critical Vulnerabilities"
          value={criticalCount}
          subtitle={criticalCount > 0 ? 'Requires immediate action' : 'No critical issues'}
          icon={<ShieldAlert className="w-5 h-5 text-rose-400" />}
          accentColor={criticalCount > 0 ? 'border-rose-500/30' : 'border-slate-800'}
          onClick={() => onNavigateToTab('findings')}
        />

        <StatCard
          id="stat-tables-count"
          title="Schema Inventory"
          value={schema ? `${schema.tables.length} Tables` : '--'}
          subtitle={schema ? `${schema.summary.totalColumns} attributes, ${schema.summary.totalEstimatedRows} rows` : 'Connect database to load'}
          icon={<Database className="w-5 h-5 text-sky-400" />}
          onClick={() => onNavigateToTab('erdiagram')}
        />

        <StatCard
          id="stat-pending-approvals"
          title="Pending Approvals"
          value={pendingApprovals}
          subtitle={pendingApprovals > 0 ? 'Awaiting safety sign-off' : 'All recommendations processed'}
          icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
          accentColor={pendingApprovals > 0 ? 'border-amber-500/30' : 'border-slate-800'}
          onClick={() => onNavigateToTab('recommendations')}
        />
      </div>

      {/* Middle Grid: Category Health Breakdown & Database Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health Breakdown */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-slate-100 text-sm">Health Category Distribution</h3>
              <p className="text-xs text-slate-400">Deterministic scoring across core architectural dimensions</p>
            </div>
            <button
              onClick={() => onNavigateToTab('health')}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1"
            >
              Detailed Breakdown <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {score ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(score.categories).map(([catKey, val]) => {
                const numVal = Number(val);
                const color =
                  numVal >= 85 ? 'text-emerald-400' : numVal >= 70 ? 'text-amber-400' : 'text-rose-400';
                const bgBar =
                  numVal >= 85 ? 'bg-emerald-500' : numVal >= 70 ? 'bg-amber-500' : 'bg-rose-500';

                return (
                  <div key={catKey} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 capitalize font-medium">
                        {catKey.replace(/([A-Z])/g, ' $1')}
                      </span>
                      <span className={`text-sm font-bold font-mono ${color}`}>{numVal}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                      <div className={`h-full rounded-full ${bgBar}`} style={{ width: `${numVal}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 text-xs">
              Run an audit to compute multi-dimensional health metrics.
            </div>
          )}

          {score && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-sky-400">Automated Diagnosis: </span>
              {score.explanation}
            </div>
          )}
        </div>

        {/* Database Connection & Quick Switch */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">Database Instance</h3>
              {activeProject?.connectionStatus === 'CONNECTED' ? (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  CONNECTED
                </span>
              ) : activeProject?.connectionStatus === 'ERROR' ? (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                  ERROR
                </span>
              ) : (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  NOT CONNECTED
                </span>
              )}
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Instance Name</span>
                <span className="text-slate-200 font-mono font-semibold truncate max-w-[150px]">
                  {schema?.databaseName || activeProject?.connectionConfig?.name || activeProject?.connectionConfig?.database || 'Not Connected'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Engine Type</span>
                <span className="text-slate-200 font-mono uppercase">{activeProject?.databaseType}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Total Entities</span>
                <span className="text-slate-200 font-mono">{schema?.tables.length || 0} tables</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Indexes Defined</span>
                <span className="text-slate-200 font-mono">{schema?.summary.totalIndexes || 0}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Foreign Constraints</span>
                <span className="text-slate-200 font-mono">{schema?.summary.totalForeignKeys || 0}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={() => onNavigateToTab('connection')}
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors flex items-center justify-center gap-2 border border-slate-700 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-sky-400" />
              <span>{activeProject?.connectionStatus === 'CONNECTED' ? 'Manage DB Connection' : 'Connect Database (.sql, .db, server)'}</span>
            </button>
            <button
              onClick={() => onNavigateToTab('erdiagram')}
              className="w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-xs font-semibold text-slate-300 transition-colors flex items-center justify-center gap-2 border border-slate-800"
            >
              <GitGraph className="w-3.5 h-3.5 text-slate-400" />
              <span>Explore ER Diagram</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Section: Top Vulnerabilities requiring action */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-slate-100 text-sm">Prioritized Audit Findings</h3>
            <p className="text-xs text-slate-400">Critical and high severity flaws identified in schema</p>
          </div>
          <button
            onClick={() => onNavigateToTab('findings')}
            className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1"
          >
            View All ({findings.length}) <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {findings.length === 0 ? (
          <div className="text-center py-10">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-semibold text-slate-300">Clean Bill of Health</p>
            <p className="text-xs text-slate-500 mt-1">No outstanding security or performance violations detected.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {findings.slice(0, 4).map(f => (
              <div
                key={f.id}
                onClick={() => onNavigateToTab('findings')}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/30 px-2 rounded-lg cursor-pointer transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={f.severity} size="sm" />
                    <span className="font-semibold text-slate-200 text-xs">{f.title}</span>
                    <span className="text-[11px] font-mono text-slate-500">[{f.databaseObject}]</span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-1">{f.description}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-slate-500 font-mono capitalize">{f.category}</span>
                  <span className="text-xs text-sky-400 font-medium flex items-center gap-1">
                    Fix <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
