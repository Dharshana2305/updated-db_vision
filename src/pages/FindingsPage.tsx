import React, { useState } from 'react';
import {
  AlertTriangle,
  Search,
  Filter,
  CheckCircle,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Save,
  Code,
  Shield,
  Layers,
  Zap,
  Play,
  RotateCcw,
  CheckCircle2,
  Wrench,
  Wand2,
  Download,
  Database,
  FileCode,
  Sparkles
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';
import { SeverityBadge } from '../components/SeverityBadge.js';
import { Finding, FindingSeverity } from '../types.js';
import { api } from '../api.js';

export const FindingsPage: React.FC = () => {
  const { activeProject, latestReview, refreshReviewData, refreshSchema } = useProject();

  const [search, setSearch] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesState, setNotesState] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [applyingFixId, setApplyingFixId] = useState<string | null>(null);
  const [isBulkFixing, setIsBulkFixing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadDropdown, setDownloadDropdown] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showFixedBanner, setShowFixedBanner] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const findings = latestReview?.findings || [];

  const handleFixAll = async () => {
    if (!activeProject || isBulkFixing) return;

    setIsBulkFixing(true);
    setActionFeedback(null);
    try {
      const res = await api.fixAllFindingsAndFlaws(activeProject.id);
      setActionFeedback({ type: 'success', message: res.message || 'All findings and flaws remediated successfully!' });
      setShowFixedBanner(true);
      await refreshReviewData();
      await refreshSchema();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: `1-Click Fix failed: ${err.message}` });
    } finally {
      setIsBulkFixing(false);
    }
  };

  const handleResetAudit = async () => {
    if (!activeProject || isResetting) return;

    setIsResetting(true);
    setActionFeedback(null);
    try {
      const res = await api.resetAudit(activeProject.id);
      setActionFeedback({ type: 'success', message: res.message || 'Audit reset: flaws re-opened for testing!' });
      setShowFixedBanner(false);
      await refreshReviewData();
      await refreshSchema();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: `Reset failed: ${err.message}` });
    } finally {
      setIsResetting(false);
    }
  };

  const handleDownloadUpdatedFile = async (format: 'sqlite' | 'sql') => {
    if (!activeProject || isExporting) return;
    setIsExporting(true);
    setDownloadDropdown(false);
    try {
      await api.downloadUpdatedDatabaseFile(activeProject.id, format);
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveNote = async (findingId: string) => {
    setSavingNote(findingId);
    try {
      const note = notesState[findingId] ?? '';
      await api.updateFinding(findingId, { notes: note });
      await refreshReviewData();
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setSavingNote(null);
    }
  };

  const handleApplyFix = async (f: Finding) => {
    if (!activeProject || applyingFixId) return;
    setApplyingFixId(f.id);
    setActionFeedback(null);
    try {
      const res = await api.applyFindingFix(f.id, activeProject.id);
      setActionFeedback({ type: 'success', message: res.message || `Successfully applied fix for "${f.title}"!` });
      await refreshReviewData();
      await refreshSchema();
      setTimeout(() => setActionFeedback(null), 5000);
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Failed to apply fix on database' });
    } finally {
      setApplyingFixId(null);
    }
  };

  const handleRollbackFix = async (f: Finding) => {
    if (!activeProject || applyingFixId) return;
    setApplyingFixId(f.id);
    setActionFeedback(null);
    try {
      const res = await api.rollbackFindingFix(f.id, activeProject.id);
      setActionFeedback({ type: 'success', message: res.message || `Successfully rolled back fix for "${f.title}"!` });
      await refreshReviewData();
      await refreshSchema();
      setTimeout(() => setActionFeedback(null), 5000);
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Failed to rollback fix on database' });
    } finally {
      setApplyingFixId(null);
    }
  };

  const filtered = findings.filter(f => {
    if (selectedSeverity !== 'ALL' && f.severity !== selectedSeverity) return false;
    if (selectedCategory !== 'ALL' && f.category !== selectedCategory) return false;
    if (selectedStatus === 'OPEN' && f.status === 'APPLIED') return false;
    if (selectedStatus === 'APPLIED' && f.status !== 'APPLIED') return false;
    if (search) {
      const term = search.toLowerCase();
      return (
        f.title.toLowerCase().includes(term) ||
        f.description.toLowerCase().includes(term) ||
        f.databaseObject.toLowerCase().includes(term) ||
        f.table.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const appliedCount = findings.filter(f => f.status === 'APPLIED').length;
  const openCount = findings.length - appliedCount;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <span>Findings &amp; Vulnerabilities</span>
            {appliedCount > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold font-mono">
                {appliedCount} Fixed
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {openCount} open issues &bull; {appliedCount} applied fixes across active database
          </p>
        </div>

        {/* 1-Click Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Reset / Re-audit Flaws */}
          <button
            onClick={handleResetAudit}
            disabled={isResetting || isBulkFixing}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-400 border border-sky-500/30 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            title="Reset audit and re-open flaws to test 1-Click Fix"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
            <span>{isResetting ? 'Resetting...' : 'Reset Flaws'}</span>
          </button>

          <button
            onClick={handleFixAll}
            disabled={isBulkFixing || isResetting}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="Fix all open findings & flaws in one click"
          >
            <Wand2 className="w-4 h-4" />
            <span>{isBulkFixing ? 'Fixing All Flaws...' : openCount > 0 ? `Fix All Flaws (${openCount})` : 'Re-verify & Fix All'}</span>
          </button>

          {/* Download Updated File Button */}
          <div className="relative">
            <button
              onClick={() => setDownloadDropdown(!downloadDropdown)}
              disabled={isExporting}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-400 border border-sky-500/30 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              title="Download updated and hardened database"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Exporting...' : 'Download Updated File'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {downloadDropdown && (
              <div className="absolute right-0 mt-1 w-56 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-30 p-1.5 space-y-1 text-xs">
                <button
                  onClick={() => handleDownloadUpdatedFile('sqlite')}
                  className="w-full text-left p-2 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5 text-sky-400" />
                  <div>
                    <div className="font-semibold">Download SQLite (.sqlite)</div>
                    <div className="text-[10px] text-slate-400">Binary database file</div>
                  </div>
                </button>
                <button
                  onClick={() => handleDownloadUpdatedFile('sql')}
                  className="w-full text-left p-2 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                  <div>
                    <div className="font-semibold">Download SQL (.sql)</div>
                    <div className="text-[10px] text-slate-400">DDL &amp; Data dump</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Just Fixed All Banner */}
      {showFixedBanner && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <h3 className="font-bold text-sm text-emerald-100">All Findings &amp; Flaws Fixed Successfully!</h3>
              <p className="text-emerald-300/90 text-xs">
                Your database has been remediated. You can download the updated file right away.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleDownloadUpdatedFile('sqlite')}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .sqlite</span>
            </button>
            <button
              onClick={() => handleDownloadUpdatedFile('sql')}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Download .sql</span>
            </button>
          </div>
        </div>
      )}

      {/* Action Notification Banner */}
      {actionFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between transition-all ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by issue title, table, or column..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Severity:</span>
            <select
              value={selectedSeverity}
              onChange={e => setSelectedSeverity(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
              <option value="INFO">INFO</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Category:</span>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">All Categories</option>
              <option value="security">Security</option>
              <option value="structure">Structure / Normalization</option>
              <option value="performance">Performance &amp; Indexes</option>
              <option value="quality">Data Quality</option>
              <option value="relationships">Relationships</option>
              <option value="maintainability">Maintainability</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Status:</span>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open Issues</option>
              <option value="APPLIED">Applied Fixes</option>
            </select>
          </div>
        </div>
      </div>

      {/* Findings List */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center text-slate-500 bg-slate-900/40 border border-slate-800 rounded-2xl">
          <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
          <p className="text-sm font-semibold text-slate-300">No matching findings</p>
          <p className="text-xs text-slate-500 mt-1">Try relaxing your search terms or filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(f => {
            const isExpanded = expandedId === f.id;
            const currentNote = notesState[f.id] ?? f.notes ?? '';
            const isFixed = f.status === 'APPLIED';
            const hasFixSql = Boolean(f.suggestedFix && f.suggestedFix.trim() && !f.suggestedFix.trim().startsWith('--'));
            const isBusy = applyingFixId === f.id;

            return (
              <div
                key={f.id}
                className={`border rounded-xl overflow-hidden transition-all ${
                  isFixed
                    ? 'bg-slate-900/70 border-emerald-500/30'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : f.id)}
                  className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/40 select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <SeverityBadge severity={f.severity} size="sm" />
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200 truncate">{f.title}</span>
                        <span className="text-[11px] font-mono text-slate-500">[{f.databaseObject}]</span>
                        {isFixed && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold font-mono">
                            ✓ FIXED
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{f.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="hidden sm:flex flex-col text-right">
                      <span className="text-[10px] text-slate-500 uppercase font-mono">{f.category}</span>
                      <span className="text-[11px] text-sky-400 font-mono font-medium">Conf: {f.confidence}%</span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details Body */}
                {isExpanded && (
                  <div className="p-5 border-t border-slate-800 bg-slate-950/60 space-y-4 text-xs">
                    {/* Grid metadata */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Severity / Risk</span>
                        <span className="font-mono font-bold text-slate-200">{f.severity} / {f.risk}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Category</span>
                        <span className="font-mono font-bold text-slate-200 capitalize">{f.category}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Confidence</span>
                        <span className="font-mono font-bold text-emerald-400">{f.confidence}%</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Fix Status</span>
                        <span className={`font-mono font-bold ${isFixed ? 'text-emerald-400' : f.safeToApplyAuto ? 'text-sky-400' : 'text-amber-400'}`}>
                          {isFixed ? 'APPLIED (Fixed)' : f.safeToApplyAuto ? 'SAFE TO APPLY' : 'MANUAL REVIEW'}
                        </span>
                      </div>
                    </div>

                    {/* Why It Matters */}
                    <div>
                      <h4 className="font-semibold text-sky-400 uppercase tracking-wider text-[11px] mb-1">
                        Why It Matters (Architectural Impact):
                      </h4>
                      <p className="text-slate-300 leading-relaxed bg-slate-900 p-3 rounded-lg border border-slate-800">
                        {f.whyItMatters}
                      </p>
                    </div>

                    {/* Recommendation */}
                    <div>
                      <h4 className="font-semibold text-emerald-400 uppercase tracking-wider text-[11px] mb-1">
                        Recommended Solution:
                      </h4>
                      <p className="text-slate-300 leading-relaxed bg-slate-900 p-3 rounded-lg border border-slate-800">
                        {f.recommendation}
                      </p>
                    </div>

                    {/* Action & Fix Section */}
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                          <Wrench className="w-4 h-4 text-sky-400" />
                          <span>Remediation &amp; Automated Execution</span>
                        </div>
                        {isFixed ? (
                          <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Fix is Live on Connected Database
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-slate-400">
                            {f.safeToApplyAuto ? 'Automated safe schema modification' : 'Review SQL prior to execution'}
                          </span>
                        )}
                      </div>

                      {f.suggestedFix && (
                        <div>
                          <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-sky-300 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                            {f.suggestedFix}
                          </pre>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <span className="text-[11px] text-slate-400">
                          {isFixed
                            ? 'You can roll back this change to restore original database state.'
                            : hasFixSql
                            ? 'Click "Apply Fix" to execute this modification directly on your connected database.'
                            : 'This issue requires architectural refactoring or application-level code change.'}
                        </span>

                        <div className="flex items-center gap-2">
                          {isFixed ? (
                            <button
                              onClick={() => handleRollbackFix(f)}
                              disabled={isBusy}
                              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>{isBusy ? 'Rolling back...' : 'Rollback This Fix'}</span>
                            </button>
                          ) : hasFixSql ? (
                            <button
                              onClick={() => handleApplyFix(f)}
                              disabled={isBusy}
                              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>{isBusy ? 'Applying on Database...' : 'Apply Fix Now'}</span>
                            </button>
                          ) : (
                            <span className="text-[11px] px-2.5 py-1 rounded bg-slate-800 text-slate-400 font-mono">
                              Manual Refactoring Required
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* User Notes Section */}
                    <div className="pt-2 border-t border-slate-800">
                      <div className="flex items-center gap-2 mb-2 text-[11px] font-semibold text-slate-400 uppercase">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                        <span>Developer / Reviewer Notes</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Add team context, exception rationale, or remediation ticket..."
                          value={currentNote}
                          onChange={e => setNotesState({ ...notesState, [f.id]: e.target.value })}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                        <button
                          onClick={() => handleSaveNote(f.id)}
                          disabled={savingNote === f.id}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors"
                        >
                          <Save className="w-3.5 h-3.5 text-sky-400" />
                          <span>{savingNote === f.id ? 'Saving...' : 'Save Note'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
