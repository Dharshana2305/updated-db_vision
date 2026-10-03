import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  Code,
  ShieldAlert,
  ArrowRight,
  Database,
  CheckCheck,
  Wand2,
  Download,
  Sparkles,
  FileCode,
  Filter,
  Layers,
  ChevronDown
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';
import { api } from '../api.js';
import { RecommendationItem, AuditLog } from '../types.js';

export const RecommendationsPage: React.FC = () => {
  const { activeProject, recommendations, refreshReviewData, refreshSchema, schema } = useProject();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<'recommendations' | 'audit'>('recommendations');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [isBulkFixing, setIsBulkFixing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [downloadDropdown, setDownloadDropdown] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justFixedAll, setJustFixedAll] = useState(false);

  // Database-segregated audit log state
  const [selectedAuditDbKey, setSelectedAuditDbKey] = useState<string>('');
  const [availableAuditDatabases, setAvailableAuditDatabases] = useState<{
    key: string;
    name: string;
    logCount: number;
    isActive: boolean;
  }[]>([]);

  const loadAuditLogs = (dbKey?: string) => {
    if (!activeProject) return;
    api.getAuditLogs(activeProject.id, dbKey)
      .then(res => {
        setAuditLogs(res.auditLogs || []);
        setAvailableAuditDatabases(res.availableDatabases || []);
        if (!selectedAuditDbKey && res.activeDatabaseKey) {
          setSelectedAuditDbKey(res.activeDatabaseKey);
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    if (activeProject) {
      loadAuditLogs(selectedAuditDbKey || undefined);
    }
  }, [activeProject, selectedAuditDbKey, recommendations]);

  const handleApprove = async (rec: RecommendationItem) => {
    if (!activeProject) return;
    setProcessingId(rec.id);
    setActionMessage(null);
    setActionError(null);
    try {
      await api.approveRecommendation(rec.id, activeProject.id);
      setActionMessage(`Approved & applied on database: "${rec.title}"`);
      await refreshReviewData();
      await refreshSchema();
      loadAuditLogs(selectedAuditDbKey);
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err: any) {
      setActionError(`Approval execution failed: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveAll = async () => {
    if (!activeProject || isBulkApproving) return;
    if (pendingRecs.length === 0) return;

    if (!confirm(`Are you sure you want to approve all ${pendingRecs.length} pending recommendations in one click?`)) {
      return;
    }

    setIsBulkApproving(true);
    setActionMessage(null);
    setActionError(null);

    try {
      const res = await api.approveAllRecommendations(activeProject.id);
      setActionMessage(`Successfully approved all ${res.count} recommendations in one click!`);
      await refreshReviewData();
      loadAuditLogs(selectedAuditDbKey);
      setTimeout(() => setActionMessage(null), 6000);
    } catch (err: any) {
      setActionError(`Bulk approval failed: ${err.message}`);
    } finally {
      setIsBulkApproving(false);
    }
  };

  const handleFixAllFlaws = async () => {
    if (!activeProject || isBulkFixing) return;
    const countToFix = pendingRecs.length + recommendations.filter(r => r.status === 'APPROVED').length;

    if (!confirm(`Apply all ${countToFix} findings & flaw fixes directly to the database in one click? This will execute all safe remediation scripts and recalculate health scores.`)) {
      return;
    }

    setIsBulkFixing(true);
    setActionMessage(null);
    setActionError(null);

    try {
      const res = await api.fixAllFindingsAndFlaws(activeProject.id);
      setActionMessage(res.message);
      setJustFixedAll(true);
      await refreshReviewData();
      await refreshSchema();
      loadAuditLogs(selectedAuditDbKey);
    } catch (err: any) {
      setActionError(`1-Click Fix failed: ${err.message}`);
    } finally {
      setIsBulkFixing(false);
    }
  };

  const handleDownloadUpdatedFile = async (format: 'sqlite' | 'sql') => {
    if (!activeProject || isExporting) return;
    setIsExporting(true);
    setDownloadDropdown(false);
    try {
      await api.downloadUpdatedDatabaseFile(activeProject.id, format);
      loadAuditLogs(selectedAuditDbKey);
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleReject = async (rec: RecommendationItem) => {
    if (!activeProject) return;
    setProcessingId(rec.id);
    setActionMessage(null);
    setActionError(null);
    try {
      await api.rejectRecommendation(rec.id, activeProject.id, 'User rejected in Approval Center');
      setActionMessage(`Rejected recommendation: "${rec.title}"`);
      await refreshReviewData();
      await refreshSchema();
      loadAuditLogs(selectedAuditDbKey);
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err: any) {
      setActionError(`Reject failed: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRollback = async (rec: RecommendationItem) => {
    if (!activeProject) return;
    setProcessingId(rec.id);
    setActionMessage(null);
    setActionError(null);
    try {
      await api.rollbackRecommendation(rec.id, activeProject.id);
      setActionMessage(`Successfully executed rollback for: "${rec.title}"`);
      await refreshReviewData();
      await refreshSchema();
      loadAuditLogs(selectedAuditDbKey);
      setTimeout(() => setActionMessage(null), 5000);
    } catch (err: any) {
      setActionError(`Rollback failed: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const pendingRecs = recommendations.filter(r => r.status === 'PENDING');
  const approvedRecs = recommendations.filter(r => r.status === 'APPROVED');
  const appliedRecs = recommendations.filter(r => r.status === 'APPLIED');
  const otherRecs = recommendations.filter(r => r.status === 'REJECTED' || r.status === 'ROLLED_BACK');

  const activeDbName =
    schema?.databaseName ||
    activeProject?.connectionConfig?.name ||
    activeProject?.databaseType ||
    'Active Database';

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header & Global One-Click Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100">Approval &amp; Audit Center</h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-400">
              {activeDbName}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Maintain separate audit histories per database, approve and fix all flaws in one click, and export your updated database.
          </p>
        </div>

        {/* Action Controls & Tab Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Download Updated File Split Button */}
          <div className="relative">
            <button
              onClick={() => setDownloadDropdown(!downloadDropdown)}
              disabled={isExporting}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-400 border border-sky-500/30 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              title="Download updated and hardened database file"
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
                    <div className="font-semibold">Download SQLite Binary (.sqlite)</div>
                    <div className="text-[10px] text-slate-400">Full updated binary database</div>
                  </div>
                </button>
                <button
                  onClick={() => handleDownloadUpdatedFile('sql')}
                  className="w-full text-left p-2 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                  <div>
                    <div className="font-semibold">Download SQL Script (.sql)</div>
                    <div className="text-[10px] text-slate-400">Complete DDL &amp; Data Insert script</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Tab Toggle */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('recommendations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'recommendations' ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Recommendations ({recommendations.length})
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'audit' ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Audit History ({auditLogs.length})
            </button>
          </div>
        </div>
      </div>

      {/* Prominent One-Click Action Bar */}
      {activeTab === 'recommendations' && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-sky-950/20 to-slate-900 border border-sky-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                1-Click Autonomous Remediation Suite
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Ready
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {pendingRecs.length} pending recommendations and open flaws can be approved and remediated across <strong>{activeDbName}</strong> in a single click.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 1-Click Approve All */}
            {pendingRecs.length > 0 && (
              <button
                onClick={handleApproveAll}
                disabled={isBulkApproving || isBulkFixing}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Approve all pending recommendations in one click"
              >
                <CheckCheck className="w-4 h-4" />
                <span>{isBulkApproving ? 'Approving...' : `Approve All (${pendingRecs.length})`}</span>
              </button>
            )}

            {/* 1-Click Fix All Findings & Flaws */}
            {(pendingRecs.length > 0 || approvedRecs.length > 0) && (
              <button
                onClick={handleFixAllFlaws}
                disabled={isBulkFixing || isBulkApproving}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white text-xs font-bold transition-all shadow-lg hover:shadow-sky-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                title="Execute all safe fixes and flaw remediations in one click"
              >
                <Wand2 className="w-4 h-4" />
                <span>{isBulkFixing ? 'Fixing All Flaws...' : `Fix All Findings & Flaws (${pendingRecs.length + approvedRecs.length})`}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Just Fixed All Banner with Download Button */}
      {justFixedAll && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <h3 className="font-bold text-sm text-emerald-100">All Findings &amp; Flaws Fixed Successfully!</h3>
              <p className="text-emerald-300/90 text-xs">
                Your database is now hardened, indexed, and audited. You can download the updated database file directly.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleDownloadUpdatedFile('sqlite')}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .sqlite File</span>
            </button>
            <button
              onClick={() => handleDownloadUpdatedFile('sql')}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Download .sql Script</span>
            </button>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-[11px] underline cursor-pointer">Dismiss</button>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-[11px] underline cursor-pointer">Dismiss</button>
        </div>
      )}

      {activeTab === 'recommendations' ? (
        <div className="space-y-6">
          {/* Pending Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Awaiting Approval ({pendingRecs.length})
              </h3>
              {pendingRecs.length > 1 && (
                <button
                  onClick={handleApproveAll}
                  disabled={isBulkApproving}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Approve all in one click</span>
                </button>
              )}
            </div>

            {pendingRecs.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/40 border border-slate-800 rounded-xl text-slate-500 text-xs">
                No pending recommendations awaiting review. All current flaws are approved or applied!
              </div>
            ) : (
              pendingRecs.map(rec => (
                <div
                  key={rec.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase">
                          Risk: {rec.risk}
                        </span>
                        <h4 className="font-bold text-slate-100 text-sm">{rec.title}</h4>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{rec.problem}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleReject(rec)}
                        disabled={processingId === rec.id}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-300 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>

                      <button
                        onClick={() => handleApprove(rec)}
                        disabled={processingId === rec.id}
                        className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{processingId === rec.id ? 'Applying...' : 'Approve & Apply'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Safety Checks Card */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                      Pre-Execution Safety Verification:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">Lock Potential:</span>
                        <span className="text-slate-300 font-medium">{rec.safetyChecks.potentialLocks}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Affected Target:</span>
                        <span className="text-slate-300 font-mono">{rec.safetyChecks.affectedObjects.join(', ')}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Potential Data Loss:</span>
                        <span className="text-emerald-400 font-medium">None (Non-destructive)</span>
                      </div>
                    </div>
                  </div>

                  {/* Proposed Operation SQL */}
                  {rec.proposedOperation && (
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase font-semibold block mb-1">
                        Proposed SQL / Operation:
                      </span>
                      <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-sky-300 font-mono text-xs overflow-x-auto">
                        {rec.proposedOperation}
                      </pre>
                    </div>
                  )}

                  {/* Rollback Strategy */}
                  {rec.rollbackOperation && (
                    <div className="text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-500">Rollback Plan: </span>
                      <code className="text-slate-400">{rec.rollbackOperation}</code>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Applied & Rollback Section */}
          {appliedRecs.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Applied Fixes ({appliedRecs.length})
                </h3>
                <button
                  onClick={() => handleDownloadUpdatedFile('sqlite')}
                  className="text-xs font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download remediated database</span>
                </button>
              </div>

              <div className="space-y-2">
                {appliedRecs.map(rec => (
                  <div key={rec.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-200">{rec.title}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          APPLIED
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 font-mono">{rec.appliedResult}</div>
                    </div>

                    {rec.rollbackOperation && !rec.rollbackOperation.startsWith('--') && (
                      <button
                        onClick={() => handleRollback(rec)}
                        disabled={processingId === rec.id}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 font-semibold text-xs transition-colors flex items-center gap-1.5 border border-slate-700 shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{processingId === rec.id ? 'Rolling back...' : 'Rollback Fix'}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Tab 2: Audit History Segregated by Database */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {/* Database Selector Bar for Audit Logs */}
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-100 text-sm">System Audit Trail</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-400">
                  Database-Segregated
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Complete, tamper-evident audit history maintained separately for each database in this workspace.
              </p>
            </div>

            {/* Database Filter Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-slate-400" />
                Filter Database:
              </span>
              <select
                value={selectedAuditDbKey}
                onChange={e => setSelectedAuditDbKey(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                <option value="all">All Databases in Workspace</option>
                {availableAuditDatabases.map(db => (
                  <option key={db.key} value={db.key}>
                    {db.name} ({db.logCount} events){db.isActive ? ' [Active]' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-800/80">
            {auditLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No audit events recorded yet for this database.
              </div>
            ) : (
              auditLogs.map(log => (
                <div key={log.id} className="p-4 text-xs space-y-1 hover:bg-slate-800/30 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-slate-400 gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sky-400 uppercase font-mono text-[10px] px-1.5 py-0.5 rounded bg-sky-950 border border-sky-800">
                        {log.action}
                      </span>
                      {log.databaseName && (
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-1.5 py-0.5 rounded">
                          {log.databaseName}
                        </span>
                      )}
                      <span className="font-semibold text-slate-200">{log.targetObject}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">{log.details}</p>
                  {log.sqlExecuted && (
                    <pre className="p-2 rounded-lg bg-slate-950 text-sky-300 font-mono text-[11px] mt-1 overflow-x-auto border border-slate-800/60">
                      {log.sqlExecuted}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
