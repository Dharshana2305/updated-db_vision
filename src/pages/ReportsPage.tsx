import React, { useState } from 'react';
import {
  FileText,
  Download,
  Printer,
  FileCode,
  CheckCircle,
  Database,
  Activity,
  Shield,
  Layers,
  Zap,
  Code
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';
import { api } from '../api.js';
import { SeverityBadge } from '../components/SeverityBadge.js';

export const ReportsPage: React.FC = () => {
  const { activeProject, latestReview, recommendations } = useProject();
  const [downloading, setDownloading] = useState<string | null>(null);

  if (!latestReview) {
    return (
      <div className="p-12 text-center text-slate-500 space-y-3">
        <FileText className="w-12 h-12 mx-auto text-slate-700" />
        <h3 className="text-base font-semibold text-slate-300">No Review Report Available</h3>
        <p className="text-xs">Execute a database review first to compile the comprehensive evaluation report.</p>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async (format: 'json' | 'markdown' | 'csv' | 'migration') => {
    if (!latestReview) return;
    setDownloading(format);
    try {
      const res = await api.exportReport(latestReview.id, format);
      const blob = new Blob([res.content], { type: res.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setDownloading(null);
    }
  };

  const score = latestReview.healthScore;
  const findings = latestReview.findings;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Executive Audit &amp; Compliance Report</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Formal architectural review document for college examination and production audits
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-sky-400" />
            <span>Print / Save PDF</span>
          </button>

          <button
            onClick={() => handleDownload('json')}
            disabled={downloading === 'json'}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>JSON</span>
          </button>

          <button
            onClick={() => handleDownload('csv')}
            disabled={downloading === 'csv'}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>CSV</span>
          </button>

          {activeProject?.databaseType === 'sqlite' && (
            <a
              href={api.getDatabaseDownloadUrl(activeProject.id)}
              download
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Download Updated DB (.db)</span>
            </a>
          )}

          <a
            href={api.getMigrationDownloadUrl(activeProject?.id || '')}
            download
            className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Export Migration (.sql)</span>
          </a>
        </div>
      </div>

      {/* Formal Printable Document Layout */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-8 print:bg-white print:text-black print:p-0 print:border-none">
        {/* Document Header */}
        <div className="border-b border-slate-800 pb-6 print:border-black">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs uppercase font-mono tracking-widest text-sky-400 font-bold print:text-blue-700">
                AI Powered Database Reviewer &bull; Audit Dossier
              </span>
              <h2 className="text-2xl font-bold text-slate-100 mt-1 print:text-black">
                Architectural Assessment &amp; Quality Audit
              </h2>
              <p className="text-xs text-slate-400 mt-1 print:text-gray-600">
                Target Instance: <span className="font-mono text-slate-200 print:text-black font-bold">{latestReview.schemaSnapshot.databaseName}</span> ({activeProject?.databaseType.toUpperCase()})
              </p>
            </div>

            <div className="text-right">
              <div className="text-3xl font-extrabold font-mono text-sky-400 print:text-black">
                {score.overall}/100
              </div>
              <div className="text-xs text-slate-400 print:text-gray-600 font-mono">
                Grade: <span className="font-bold text-slate-200 print:text-black">{score.grade}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-6 text-[11px] text-slate-500 print:text-gray-600 font-mono">
            <span>Audit Date: {new Date(latestReview.createdAt).toLocaleDateString()}</span>
            <span>Review ID: {latestReview.id}</span>
            <span>Tables Audited: {latestReview.schemaSnapshot.tables.length}</span>
            <span>Identified Flaws: {findings.length}</span>
          </div>
        </div>

        {/* 1. Executive Summary */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 print:text-black">
            1. Executive Summary
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800 print:bg-gray-50 print:border-gray-300 print:text-gray-800">
            {latestReview.summary}
          </p>
        </div>

        {/* 2. Deterministic Health Score Breakdown */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 print:text-black">
            2. Health Category Breakdown
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            {Object.entries(score.categories).map(([catKey, val]) => (
              <div key={catKey} className="p-3 rounded-xl bg-slate-950 border border-slate-800 print:border-gray-300 print:bg-white">
                <span className="text-[11px] text-slate-400 capitalize block print:text-gray-600">{catKey}</span>
                <span className="text-base font-bold font-mono text-sky-400 print:text-black mt-0.5 block">
                  {val}/100
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Detailed Findings List */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 print:text-black">
            3. Discovered Vulnerabilities &amp; Normalization Flaws
          </h3>

          <div className="space-y-3">
            {findings.map((f, i) => (
              <div
                key={f.id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 print:border-gray-300 print:bg-white text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-400 font-mono">#{i + 1}</span>
                    <span className="font-bold text-slate-100 print:text-black">{f.title}</span>
                    <span className="font-mono text-[11px] text-slate-500">[{f.databaseObject}]</span>
                  </div>
                  <SeverityBadge severity={f.severity} size="sm" />
                </div>

                <p className="text-slate-300 print:text-gray-700 leading-relaxed">{f.description}</p>

                <div className="text-[11px] text-slate-400 print:text-gray-600">
                  <strong>Impact: </strong>{f.whyItMatters}
                </div>

                <div className="text-[11px] text-sky-400 print:text-blue-800 font-medium">
                  <strong>Remediation: </strong>{f.recommendation}
                </div>

                {f.suggestedFix && (
                  <pre className="p-2.5 rounded bg-slate-900 border border-slate-800 print:bg-gray-100 print:border-gray-300 text-slate-300 print:text-black font-mono text-[11px] overflow-x-auto">
                    {f.suggestedFix}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 4. Remediation Migration Plan */}
        <div className="space-y-3 border-t border-slate-800 pt-6 print:border-black">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 print:text-black">
            4. Migration Plan Summary
          </h3>
          <p className="text-xs text-slate-400 print:text-gray-600">
            {recommendations.length} recommendations formulated. {recommendations.filter(r => r.status === 'APPLIED').length} applied, {recommendations.filter(r => r.status === 'PENDING').length} awaiting safety sign-off.
          </p>
        </div>
      </div>
    </div>
  );
};
