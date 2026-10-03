import React, { useState, useEffect, useCallback } from 'react';
import {
  GitCompare,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Sparkles,
  Loader2,
  RefreshCw,
  Layers,
  ShieldAlert,
  ArrowLeftRight,
  Table,
  PlusCircle,
  MinusCircle,
  FileDiff,
  ShieldCheck,
  Check
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';
import { api } from '../api.js';
import { Review } from '../types.js';
import { SeverityBadge } from '../components/SeverityBadge.js';

export const HistoryComparePage: React.FC = () => {
  const { activeProject, refreshReviewData, refreshSchema } = useProject();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [r1Id, setR1Id] = useState<string>('');
  const [r2Id, setR2Id] = useState<string>('');
  const [comparison, setComparison] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggeringReview, setTriggeringReview] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'drift' | 'resolved' | 'new' | 'persistent'>('overview');

  const fetchReviewsList = useCallback(async () => {
    if (!activeProject) return;
    try {
      const res = await api.getReviews(activeProject.id);
      const list = res.reviews || [];
      setReviews(list);

      if (list.length >= 2) {
        setR1Id(list[1].id); // Base: older review
        setR2Id(list[0].id); // Target: latest review
      } else if (list.length === 1) {
        setR1Id(list[0].id);
        setR2Id(list[0].id);
      } else {
        setR1Id('');
        setR2Id('');
      }
    } catch (err: any) {
      console.error('Failed to load reviews list:', err);
    }
  }, [activeProject]);

  useEffect(() => {
    fetchReviewsList();
  }, [fetchReviewsList]);

  // Load comparison whenever r1Id or r2Id change
  useEffect(() => {
    if (!activeProject || !r1Id || !r2Id) {
      setComparison(null);
      return;
    }

    setLoading(true);
    setErrorNotice(null);
    api.compareReviews(activeProject.id, r1Id, r2Id)
      .then(res => {
        const comp = res.comparison || {
          targetScore: res.newerReview?.overallScore ?? 0,
          baseScore: res.olderReview?.overallScore ?? 0,
          scoreDelta: res.scoreDelta ?? 0,
          categoryDeltas: res.categoryDeltas || {},
          resolvedFindings: res.resolvedIssues || [],
          newFindings: res.newIssues || [],
          persistentFindings: res.persistentIssues || [],
          schemaDrift: res.schemaDrift || {
            hasChanges: false,
            addedTables: [],
            removedTables: [],
            modifiedTables: [],
            totalTablesDelta: 0,
            totalColumnsDelta: 0,
            totalIndexesDelta: 0
          }
        };
        setComparison(comp);
      })
      .catch((err: any) => {
        console.error('Comparison error:', err);
        setErrorNotice(err.message || 'Unable to compute review comparison.');
      })
      .finally(() => setLoading(false));
  }, [activeProject, r1Id, r2Id]);

  const handleRunNewReview = async () => {
    if (!activeProject || triggeringReview) return;
    setTriggeringReview(true);
    setErrorNotice(null);
    try {
      await api.runReview(activeProject.id);
      await refreshReviewData();
      await refreshSchema();
      await fetchReviewsList();
    } catch (err: any) {
      console.error('Failed to run review:', err);
      setErrorNotice(err.message || 'Review execution failed.');
    } finally {
      setTriggeringReview(false);
    }
  };

  const handleSwapVersions = () => {
    const temp = r1Id;
    setR1Id(r2Id);
    setR2Id(temp);
  };

  const getReviewLabel = (r: Review, idx: number) => {
    const verNumber = reviews.length - idx;
    const timeStr = new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date(r.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `V${verNumber} • ${dateStr} ${timeStr} • Score: ${r.healthScore?.overall || 0}/100`;
  };

  // State 1: No reviews recorded at all
  if (reviews.length === 0) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mx-auto">
            <GitCompare className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">No Review Runs Recorded Yet</h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1.5 leading-relaxed">
              To compare schema regressions, health score deltas, and verified fixes, trigger an initial automated review of your database.
            </p>
          </div>
          <button
            onClick={handleRunNewReview}
            disabled={triggeringReview}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-sky-500/20 disabled:opacity-50"
          >
            {triggeringReview ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Running Audit Review...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Run Initial Audit Review</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const drift = comparison?.schemaDrift;
  const resolvedFindings = comparison?.resolvedFindings || [];
  const newFindings = comparison?.newFindings || [];
  const persistentFindings = comparison?.persistentFindings || [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-400 uppercase tracking-wider">
            <GitCompare className="w-3.5 h-3.5" />
            Audit History &amp; Drift Comparison
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mt-1">Review Version Diff &amp; Schema Drift</h1>
          <p className="text-xs text-slate-400 mt-1">
            Compare snapshots to track health score progression (+/-), verified vulnerability fixes, and DDL schema drift.
          </p>
        </div>

        <button
          onClick={handleRunNewReview}
          disabled={triggeringReview}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-all shadow-lg shadow-sky-600/20 disabled:opacity-50 shrink-0"
        >
          {triggeringReview ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Analyzing New Audit...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Run Fresh Review</span>
            </>
          )}
        </button>
      </div>

      {errorNotice && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{errorNotice}</span>
        </div>
      )}

      {/* Version Selectors Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Base Version */}
          <div className="flex-1 sm:flex-none">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
              Base Snapshot (Older)
            </label>
            <select
              value={r1Id}
              onChange={e => setR1Id(e.target.value)}
              className="w-full sm:w-64 bg-slate-950 border border-slate-800 text-xs text-slate-200 px-3 py-2 rounded-xl focus:outline-none focus:border-sky-500 font-mono"
            >
              {reviews.map((r, idx) => (
                <option key={r.id} value={r.id}>
                  {getReviewLabel(r, idx)}
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <button
            onClick={handleSwapVersions}
            title="Swap base and target versions"
            className="sm:mt-5 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-sky-400 border border-slate-700 transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>

          {/* Target Version */}
          <div className="flex-1 sm:flex-none">
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
              Target Comparison (Newer)
            </label>
            <select
              value={r2Id}
              onChange={e => setR2Id(e.target.value)}
              className="w-full sm:w-64 bg-slate-950 border border-slate-800 text-xs text-slate-200 px-3 py-2 rounded-xl focus:outline-none focus:border-sky-500 font-mono"
            >
              {reviews.map((r, idx) => (
                <option key={r.id} value={r.id}>
                  {getReviewLabel(r, idx)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="font-mono bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
            Total Audits: <strong className="text-slate-200">{reviews.length}</strong>
          </span>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="p-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3 bg-slate-900 border border-slate-800 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
          <span>Computing structural drift and finding resolutions...</span>
        </div>
      ) : comparison ? (
        <div className="space-y-6">
          {/* Main Score Progression Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Overall Health Score Progression
                </span>
                <div className="flex items-baseline gap-3 mt-1.5">
                  <span className="text-4xl font-extrabold text-slate-100 font-mono">
                    {comparison.targetScore}
                    <span className="text-sm font-normal text-slate-500"> / 100</span>
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    (Base was {comparison.baseScore}/100)
                  </span>
                </div>
              </div>

              {/* Delta Tag */}
              <div className="flex items-center gap-3">
                {comparison.scoreDelta > 0 ? (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono font-bold text-base">
                    <TrendingUp className="w-5 h-5" />
                    <span>+{comparison.scoreDelta} Points (Improved)</span>
                  </div>
                ) : comparison.scoreDelta < 0 ? (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 font-mono font-bold text-base">
                    <TrendingDown className="w-5 h-5" />
                    <span>{comparison.scoreDelta} Points (Regression)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-mono font-bold text-base">
                    <Minus className="w-5 h-5" />
                    <span>0 Points (Maintained)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Category Score Delta Bars */}
            {comparison.categoryDeltas && Object.keys(comparison.categoryDeltas).length > 0 && (
              <div className="mt-6 pt-5 border-t border-slate-800/80">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-3">
                  Score Deltas by Category
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                  {Object.entries(comparison.categoryDeltas).map(([cat, delta]: [string, any]) => (
                    <div key={cat} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block truncate">
                        {cat}
                      </span>
                      <div className={`text-xs font-mono font-bold mt-1 ${
                        delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-400'
                      }`}>
                        {delta > 0 ? `+${delta}` : delta} pts
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div
              onClick={() => setActiveTab('resolved')}
              className={`p-4 rounded-2xl bg-slate-900 border transition-all cursor-pointer ${
                activeTab === 'resolved' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Resolved Fixes</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-2">
                {resolvedFindings.length}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Verified &amp; mitigated</span>
            </div>

            <div
              onClick={() => setActiveTab('new')}
              className={`p-4 rounded-2xl bg-slate-900 border transition-all cursor-pointer ${
                activeTab === 'new' ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>New Findings</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-2">
                {newFindings.length}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Potential regressions</span>
            </div>

            <div
              onClick={() => setActiveTab('persistent')}
              className={`p-4 rounded-2xl bg-slate-900 border transition-all cursor-pointer ${
                activeTab === 'persistent' ? 'border-sky-500/50 bg-sky-500/5' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Persistent Issues</span>
                <Layers className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-200 mt-2">
                {persistentFindings.length}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Awaiting remediation</span>
            </div>

            <div
              onClick={() => setActiveTab('drift')}
              className={`p-4 rounded-2xl bg-slate-900 border transition-all cursor-pointer ${
                activeTab === 'drift' ? 'border-purple-500/50 bg-purple-500/5' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Schema Drift</span>
                <FileDiff className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-purple-400 mt-2">
                {drift?.hasChanges ? 'Detected' : 'Identical'}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">DDL &amp; Index changes</span>
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'overview'
                  ? 'bg-slate-800 text-sky-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Summary Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('drift')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'drift'
                  ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileDiff className="w-3.5 h-3.5" />
              <span>Schema Drift &amp; DDL Diff</span>
              {drift?.hasChanges && (
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('resolved')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'resolved'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Resolved ({resolvedFindings.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('new')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'new'
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>New Regressions ({newFindings.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('persistent')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'persistent'
                  ? 'bg-slate-800 text-sky-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Persistent ({persistentFindings.length})</span>
            </button>
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Resolved Highlights */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Resolved Vulnerabilities ({resolvedFindings.length})
                  </h3>
                  <button
                    onClick={() => setActiveTab('resolved')}
                    className="text-xs text-sky-400 hover:underline"
                  >
                    View all
                  </button>
                </div>

                {resolvedFindings.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs bg-slate-950 rounded-xl border border-slate-800/80">
                    No resolved findings recorded between these two versions.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {resolvedFindings.slice(0, 4).map((f: any) => (
                      <div key={f.id} className="p-3 rounded-xl bg-slate-950 border border-emerald-500/20 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-200">{f.title}</span>
                          <SeverityBadge severity={f.severity} size="sm" />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span>Target: {f.databaseObject}</span>
                          <span className="text-emerald-400 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            {f.resolutionReason || 'Applied'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Regressions or Persistent */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    New Vulnerabilities ({newFindings.length})
                  </h3>
                  <button
                    onClick={() => setActiveTab('new')}
                    className="text-xs text-sky-400 hover:underline"
                  >
                    View all
                  </button>
                </div>

                {newFindings.length === 0 ? (
                  <div className="p-6 text-center text-emerald-400/80 text-xs bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    <span>No new vulnerabilities or regressions introduced!</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {newFindings.slice(0, 4).map((f: any) => (
                      <div key={f.id} className="p-3 rounded-xl bg-slate-950 border border-amber-500/20 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-200">{f.title}</span>
                          <SeverityBadge severity={f.severity} size="sm" />
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono">Object: {f.databaseObject}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SCHEMA DRIFT */}
          {activeTab === 'drift' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <FileDiff className="w-4 h-4 text-purple-400" />
                  Database Schema &amp; DDL Structural Drift
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Automatic structural difference detection between the two audit snapshots.
                </p>
              </div>

              {!drift?.hasChanges ? (
                <div className="p-8 text-center text-slate-400 text-xs bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="font-semibold text-slate-200">Zero Schema Drift Detected</p>
                  <p className="text-slate-500 max-w-md mx-auto">
                    The underlying table definitions, columns, and indexes are identical between these two review versions.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Badges */}
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
                      Table Delta: <strong className={drift.totalTablesDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{drift.totalTablesDelta >= 0 ? `+${drift.totalTablesDelta}` : drift.totalTablesDelta}</strong>
                    </span>
                    <span className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
                      Column Delta: <strong className={drift.totalColumnsDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{drift.totalColumnsDelta >= 0 ? `+${drift.totalColumnsDelta}` : drift.totalColumnsDelta}</strong>
                    </span>
                    <span className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
                      Index Delta: <strong className={drift.totalIndexesDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{drift.totalIndexesDelta >= 0 ? `+${drift.totalIndexesDelta}` : drift.totalIndexesDelta}</strong>
                    </span>
                  </div>

                  {/* Added Tables */}
                  {drift.addedTables?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <PlusCircle className="w-3.5 h-3.5" />
                        Added Tables ({drift.addedTables.length})
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {drift.addedTables.map((t: any) => (
                          <div key={t.name} className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between">
                            <span className="font-mono font-semibold text-emerald-300">+{t.name}</span>
                            <span className="text-[11px] text-slate-400 font-mono">{t.columnsCount} columns &bull; {t.rowCount} rows</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Removed Tables */}
                  {drift.removedTables?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                        <MinusCircle className="w-3.5 h-3.5" />
                        Removed Tables ({drift.removedTables.length})
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {drift.removedTables.map((t: any) => (
                          <div key={t.name} className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs flex items-center justify-between">
                            <span className="font-mono font-semibold text-rose-300">-{t.name}</span>
                            <span className="text-[11px] text-slate-400 font-mono">{t.columnsCount} columns</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Modified Tables */}
                  {drift.modifiedTables?.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Table className="w-3.5 h-3.5" />
                        Altered Tables &amp; Column/Index Changes ({drift.modifiedTables.length})
                      </h4>
                      <div className="space-y-3">
                        {drift.modifiedTables.map((tbl: any) => (
                          <div key={tbl.tableName} className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2.5">
                            <div className="flex items-center justify-between font-mono">
                              <span className="font-bold text-slate-200">Table: {tbl.tableName}</span>
                              {tbl.rowCountDelta !== 0 && (
                                <span className={`text-[11px] ${tbl.rowCountDelta > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                  Rows: {tbl.rowCountDelta > 0 ? `+${tbl.rowCountDelta}` : tbl.rowCountDelta} (Current: {tbl.currentRowCount})
                                </span>
                              )}
                            </div>

                            {/* Added Columns */}
                            {tbl.addedColumns?.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className="text-emerald-400 font-semibold uppercase text-[10px]">Added Columns:</span>
                                {tbl.addedColumns.map((col: string) => (
                                  <span key={col} className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                                    +{col}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Added Indexes */}
                            {tbl.addedIndexes?.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className="text-sky-400 font-semibold uppercase text-[10px]">Created Indexes:</span>
                                {tbl.addedIndexes.map((idxName: string) => (
                                  <span key={idxName} className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono">
                                    +{idxName}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Removed Indexes */}
                            {tbl.removedIndexes?.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className="text-rose-400 font-semibold uppercase text-[10px]">Dropped Indexes:</span>
                                {tbl.removedIndexes.map((idxName: string) => (
                                  <span key={idxName} className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono">
                                    -{idxName}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RESOLVED FINDINGS */}
          {activeTab === 'resolved' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Resolved Vulnerabilities ({resolvedFindings.length})
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Issues present in base audit that have been remediated in current database state.
                  </p>
                </div>
              </div>

              {resolvedFindings.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs bg-slate-950 rounded-xl border border-slate-800">
                  No vulnerabilities resolved between these versions. Approve recommendations in the Approval Center to apply fixes.
                </div>
              ) : (
                <div className="space-y-3">
                  {resolvedFindings.map((f: any) => (
                    <div key={f.id} className="p-4 rounded-xl bg-slate-950 border border-emerald-500/20 text-xs space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100">{f.title}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase font-semibold">
                              Verified Mitigated
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{f.description}</p>
                        </div>
                        <SeverityBadge severity={f.severity} size="sm" />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-900 text-[11px] text-slate-500 font-mono">
                        <span>Target: <strong className="text-slate-300">{f.databaseObject}</strong></span>
                        <span>Category: {f.category}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: NEW FINDINGS */}
          {activeTab === 'new' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  New Vulnerabilities &amp; Regressions ({newFindings.length})
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Vulnerabilities identified in target version that were not present in the base snapshot.
                </p>
              </div>

              {newFindings.length === 0 ? (
                <div className="p-8 text-center text-emerald-400 text-xs bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <ShieldCheck className="w-8 h-8 mx-auto" />
                  <p className="font-bold text-slate-100">Zero Regressions Detected</p>
                  <p className="text-slate-400 max-w-md mx-auto">
                    Target version introduced zero new security, performance, or structural vulnerabilities.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {newFindings.map((f: any) => (
                    <div key={f.id} className="p-4 rounded-xl bg-slate-950 border border-amber-500/20 text-xs space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <span className="font-bold text-slate-100">{f.title}</span>
                          <p className="text-xs text-slate-400 mt-1">{f.description}</p>
                        </div>
                        <SeverityBadge severity={f.severity} size="sm" />
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Object: {f.databaseObject} &bull; Category: {f.category}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: PERSISTENT FINDINGS */}
          {activeTab === 'persistent' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  Persistent Findings ({persistentFindings.length})
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Unresolved vulnerabilities present in both the base and target review versions.
                </p>
              </div>

              {persistentFindings.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs bg-slate-950 rounded-xl border border-slate-800">
                  Zero persistent issues remaining.
                </div>
              ) : (
                <div className="space-y-3">
                  {persistentFindings.map((f: any) => (
                    <div key={f.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <span className="font-bold text-slate-200">{f.title}</span>
                          <p className="text-xs text-slate-400 mt-1">{f.description}</p>
                        </div>
                        <SeverityBadge severity={f.severity} size="sm" />
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Object: {f.databaseObject} &bull; Category: {f.category}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
