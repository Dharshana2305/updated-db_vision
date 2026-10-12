import React, { useState } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  Database,
  BarChart2,
  Table as TableIcon,
  Percent,
  Search,
  ShieldCheck,
  Play,
  RotateCw,
  Sparkles,
  Layers,
  Key,
  ShieldAlert,
  Info
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';
import { api } from '../api.js';

export const DataQualityPage: React.FC = () => {
  const { activeProject, schema, latestReview, refreshSchema, refreshReviewData } = useProject();
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [search, setSearch] = useState('');
  const [profiling, setProfiling] = useState(false);
  const [profilingMessage, setProfilingMessage] = useState<string | null>(null);
  const [profilingError, setProfilingError] = useState<string | null>(null);

  const tables = schema?.tables || [];
  const currentTable = tables.find(t => t.name === selectedTable) || tables[0];
  const qualityFindings = (latestReview?.findings || []).filter(f => f.category === 'quality');

  const handleProfileTable = async (tableName?: string) => {
    if (!activeProject || profiling) return;
    setProfiling(true);
    setProfilingError(null);
    setProfilingMessage(null);
    try {
      const res = await api.profileTable(activeProject.id, tableName, 500);
      setProfilingMessage(res.message || 'Profiling completed successfully!');
      await refreshSchema();
      await refreshReviewData();
      setTimeout(() => setProfilingMessage(null), 5000);
    } catch (err: any) {
      setProfilingError(err.message || 'Profiling execution failed');
    } finally {
      setProfiling(false);
    }
  };

  if (!schema || tables.length === 0) {
    return (
      <div className="p-12 text-center text-slate-500 space-y-4 max-w-lg mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-400">
          <Database className="w-7 h-7" />
        </div>
        <h3 className="text-base font-semibold text-slate-200">No Database Connected</h3>
        <p className="text-xs text-slate-400">
          Connect your workspace to a database (.sql, .db, .sqlite, .sqlite3, or live server) to run automated null-ratio, cardinality, and PII profiling.
        </p>
      </div>
    );
  }

  // Check whether profiling has been run on current table
  const columns = currentTable?.columns || [];
  const isCurrentTableProfiled = columns.some(c => c.nullPercentage !== undefined);
  const totalProfiledRows = tables.reduce((acc, t) => acc + (t.rowCount || 0), 0);
  const allColumns = tables.flatMap(t => t.columns);
  const highNullCount = allColumns.filter(c => (c.nullPercentage ?? 0) >= 40).length;
  const piiCount = allColumns.filter(c => Boolean(c.piiFlag)).length;

  const filteredCols = columns.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <span>Data Quality &amp; Profiler</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-400">
              Live Sampling
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic null sparsity distribution, distinct cardinality ratios, and automated PII discovery
          </p>
        </div>

        {/* Global Profiler Action */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleProfileTable()}
            disabled={profiling}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${profiling ? 'animate-spin' : ''}`} />
            <span>{profiling ? 'Profiling Database...' : 'Run Full Profiler (All Tables)'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banners */}
      {profilingMessage && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{profilingMessage}</span>
          </div>
          <button onClick={() => setProfilingMessage(null)} className="text-[11px] underline">Dismiss</button>
        </div>
      )}

      {profilingError && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-medium">{profilingError}</span>
          </div>
          <button onClick={() => setProfilingError(null)} className="text-[11px] underline">Dismiss</button>
        </div>
      )}

      {/* Profiler Callout if not yet profiled */}
      {!isCurrentTableProfiled && (
        <div className="bg-sky-950/20 border border-sky-500/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-100">Table "{currentTable?.name}" Has Not Been Profiled Yet</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Run the profiler to analyze null sparsity, distinct values, and discover PII exposures across records.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleProfileTable(currentTable?.name)}
            disabled={profiling}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-2 shrink-0 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Profile "{currentTable?.name}" Now</span>
          </button>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-[10px] font-mono uppercase text-slate-400 block">Total Records</span>
          <div className="text-xl font-bold text-slate-100 font-mono mt-1">
            {totalProfiledRows.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">{tables.length} tables cataloged</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-[10px] font-mono uppercase text-slate-400 block">Quality Anomalies</span>
          <div className={`text-xl font-bold font-mono mt-1 ${qualityFindings.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {qualityFindings.length}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Format &amp; schema flaws</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-[10px] font-mono uppercase text-slate-400 block">High NULL Columns (&ge;40%)</span>
          <div className={`text-xl font-bold font-mono mt-1 ${highNullCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {highNullCount}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Sparse attributes</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <span className="text-[10px] font-mono uppercase text-slate-400 block">PII Discovered</span>
          <div className={`text-xl font-bold font-mono mt-1 ${piiCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {piiCount}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Email, SSN, passwords</span>
        </div>
      </div>

      {/* Quality Findings Banner */}
      {qualityFindings.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            <span>{qualityFindings.length} Data Quality Issues Flagged in Audit</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {qualityFindings.map(q => (
              <div key={q.id} className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-300">
                <div className="font-semibold text-amber-300">{q.title}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{q.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table Selector & Search */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Select Table:</span>
            <select
              value={currentTable?.name || ''}
              onChange={e => setSelectedTable(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-sky-500 font-mono"
            >
              {tables.map(t => (
                <option key={t.name} value={t.name}>
                  {t.name} ({t.rowCount} rows &bull; {t.columns.length} cols)
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => handleProfileTable(currentTable?.name)}
            disabled={profiling}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 border border-sky-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RotateCw className={`w-3 h-3 ${profiling ? 'animate-spin' : ''}`} />
            <span>{profiling ? 'Profiling...' : `Profile "${currentTable?.name}"`}</span>
          </button>
        </div>

        <div className="relative min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Filter columns in table..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Profiling Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-100 text-sm font-mono flex items-center gap-2">
              <TableIcon className="w-4 h-4 text-sky-400" />
              <span>{currentTable?.name}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {currentTable?.rowCount} total records &bull; {columns.length} columns profiled
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="p-3">Column Name</th>
                <th className="p-3">Data Type</th>
                <th className="p-3">Nullable</th>
                <th className="p-3">Null % (Sparsity)</th>
                <th className="p-3">Distinct Values</th>
                <th className="p-3">Sample Preview</th>
                <th className="p-3">PII Classification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono text-xs">
              {filteredCols.map(col => {
                const nullPct = col.nullPercentage ?? 0;
                const isHighNull = nullPct >= 40;
                const isNullable = col.isNullable ?? col.nullable ?? false;
                const samples = col.sampleValues && col.sampleValues.length > 0
                  ? col.sampleValues.slice(0, 3).map(v => String(v)).join(', ')
                  : null;

                return (
                  <tr key={col.name} className="hover:bg-slate-800/40">
                    <td className="p-3 font-semibold text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span>{col.name}</span>
                        {col.isPrimaryKey && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">
                            PK
                          </span>
                        )}
                        {col.isForeignKey && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 font-bold">
                            FK
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-sky-400">{col.dataType}</td>
                    <td className="p-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                        isNullable ? 'bg-slate-800 text-slate-300' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {isNullable ? 'NULL' : 'NOT NULL'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden shrink-0">
                          <div
                            className={`h-full rounded-full ${
                              isHighNull ? 'bg-rose-500' : nullPct > 0 ? 'bg-amber-400' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, nullPct)}%` }}
                          ></div>
                        </div>
                        <span className={isHighNull ? 'text-rose-400 font-bold' : nullPct > 0 ? 'text-amber-300' : 'text-slate-300'}>
                          {col.nullPercentage !== undefined ? `${nullPct}%` : '--'}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-300">
                      {col.distinctCount !== undefined ? col.distinctCount.toLocaleString() : '--'}
                    </td>
                    <td className="p-3 text-slate-400 max-w-[200px] truncate">
                      {samples ? (
                        <span className="text-[11px] text-slate-400 font-mono" title={samples}>
                          [{samples}]
                        </span>
                      ) : (
                        <span className="text-slate-600 text-[11px]">--</span>
                      )}
                    </td>
                    <td className="p-3">
                      {col.piiFlag ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30 inline-flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3 shrink-0" />
                          <span>{col.piiFlag.type} ({col.piiFlag.maskedSample})</span>
                        </span>
                      ) : (
                        <span className="text-emerald-400/70 text-[11px] flex items-center gap-1 font-mono">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          <span>Clean</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
