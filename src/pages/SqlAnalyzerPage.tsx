import React, { useState } from 'react';
import {
  Terminal,
  Play,
  Zap,
  ShieldAlert,
  CheckCircle,
  Copy,
  Clock,
  ArrowRight,
  TrendingUp,
  FileCode
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';
import { api } from '../api.js';
import { SQLAnalysisResult, QueryResult } from '../types.js';
import { ChartVisualizer } from '../components/ChartVisualizer.js';
import { SeverityBadge } from '../components/SeverityBadge.js';

export const SqlAnalyzerPage: React.FC = () => {
  const { activeProject } = useProject();

  const [sql, setSql] = useState<string>(`SELECT * 
FROM orders o, users u 
WHERE o.user_id = u.id 
  AND u.email LIKE '%gmail.com'`);

  const [analyzing, setAnalyzing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [benchmarking, setBenchmarking] = useState(false);

  const [analysis, setAnalysis] = useState<SQLAnalysisResult | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sampleSnippets = [
    {
      name: 'Unindexed Cartesian Join & SELECT *',
      sql: `SELECT * FROM orders o, users u WHERE o.user_id = u.id AND u.email LIKE '%gmail.com'`
    },
    {
      name: 'SQL Injection Vulnerability Pattern',
      sql: `SELECT * FROM users WHERE username = 'admin' OR '1'='1' -- bypass auth`
    },
    {
      name: 'Top Spending Customers Aggregation',
      sql: `SELECT u.id, u.username, COUNT(o.id) as order_count, SUM(o.total_amount) as total_spent
FROM users u
JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.username
ORDER BY total_spent DESC
LIMIT 10;`
    }
  ];

  const handleAnalyze = async () => {
    if (!activeProject || !sql.trim()) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await api.analyzeSql(activeProject.id, sql);
      setAnalysis(res.analysis);
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExecute = async (queryToRun = sql) => {
    if (!activeProject) return;
    setExecuting(true);
    setError(null);
    try {
      const res = await api.executeSql(activeProject.id, queryToRun);
      setQueryResult(res.result);
    } catch (err: any) {
      setError(err.message || 'Query execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const handleBenchmark = async () => {
    if (!activeProject || !sql.trim()) return;
    setBenchmarking(true);
    setError(null);
    try {
      const res = await api.benchmarkSql(activeProject.id, sql, analysis?.optimizedSql);
      setBenchmarkResult(res);
    } catch (err: any) {
      setError(err.message || 'Benchmarking failed');
    } finally {
      setBenchmarking(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">SQL Optimizer &amp; AST Profiler</h1>
        <p className="text-xs text-slate-400 mt-1">
          Inspect query performance, detect injection hazards, generate index-covering SQL, and benchmark latency.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Snippet Picker */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-500 text-[11px] uppercase font-semibold shrink-0">Test Presets:</span>
        {sampleSnippets.map((snip, i) => (
          <button
            key={i}
            onClick={() => {
              setSql(snip.sql);
              setAnalysis(null);
              setQueryResult(null);
              setBenchmarkResult(null);
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 whitespace-nowrap"
          >
            {snip.name}
          </button>
        ))}
      </div>

      {/* SQL Editor Area */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Terminal className="w-4 h-4 text-sky-400" />
            <span>SQL Input Editor</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">ANSI SQL Compliant</span>
        </div>

        <textarea
          rows={5}
          value={sql}
          onChange={e => setSql(e.target.value)}
          placeholder="Paste or write your SQL query here..."
          className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500 resize-y"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-[11px] text-slate-500">
            Destructive queries (DROP/DELETE) will be flagged and prevented.
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAnalyze}
              disabled={analyzing || !sql.trim()}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{analyzing ? 'Analyzing AST...' : 'Analyze & Optimize'}</span>
            </button>

            <button
              onClick={() => handleExecute(sql)}
              disabled={executing || !sql.trim()}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{executing ? 'Executing...' : 'Execute Query'}</span>
            </button>

            <button
              onClick={handleBenchmark}
              disabled={benchmarking || !sql.trim()}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5 border border-slate-700"
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{benchmarking ? 'Benchmarking...' : 'Benchmark Latency'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Benchmark Results Card */}
      {benchmarkResult && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              Benchmark Execution Metrics (A/B Test)
            </h3>
            {benchmarkResult.improvementPct > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                +{benchmarkResult.improvementPct}% Faster
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Original Query Latency</span>
              <div className="text-lg font-bold text-slate-200 mt-1">
                {benchmarkResult.original?.averageExecutionMs} ms
              </div>
              <span className="text-[10px] text-slate-500">Averaged over 3 iterations</span>
            </div>

            {benchmarkResult.optimized && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-emerald-400 uppercase block">Optimized Query Latency</span>
                <div className="text-lg font-bold text-emerald-400 mt-1">
                  {benchmarkResult.optimized.averageExecutionMs} ms
                </div>
                <span className="text-[10px] text-slate-500">Averaged over 3 iterations</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analysis Results Display */}
      {analysis && (
        <div className="space-y-4">
          {/* Detected Anti-Patterns & Hazards */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              AST &amp; Vulnerability Issues Identified ({analysis.issues.length})
            </h3>

            {analysis.issues.length === 0 ? (
              <p className="text-xs text-emerald-400 font-medium">No performance anti-patterns or injection risks detected.</p>
            ) : (
              <div className="space-y-2">
                {analysis.issues.map((issue, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-start justify-between gap-3">
                    <div>
                      <span className="font-mono text-slate-400 text-[11px] block">{issue.type}</span>
                      <p className="text-slate-200 mt-0.5">{issue.message}</p>
                    </div>
                    <SeverityBadge severity={issue.severity} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Side-by-side SQL Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>Original Query</span>
                <span className="text-[10px] text-slate-500 font-mono">Current</span>
              </div>
              <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto min-h-[100px]">
                {analysis.originalSql}
              </pre>
            </div>

            <div className="bg-slate-900 border border-sky-500/40 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-sky-400">
                <span>AI Optimized Query</span>
                <button
                  onClick={() => handleExecute(analysis.optimizedSql)}
                  className="text-[11px] px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center gap-1"
                >
                  <Play className="w-3 h-3" />
                  Execute Optimized
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-sky-300 overflow-x-auto min-h-[100px]">
                {analysis.optimizedSql}
              </pre>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1">
            <span className="font-semibold text-sky-400">Optimization Rationale: </span>
            <span>{analysis.explanation}</span>
            <div className="text-emerald-400 font-medium mt-1">
              Estimated Impact: {analysis.estimatedImpact}
            </div>
          </div>
        </div>
      )}

      {/* Query Results & Visualizer */}
      {queryResult && (
        <div className="space-y-2">
          <h3 className="font-bold text-slate-100 text-sm">Query Execution Output</h3>
          <ChartVisualizer queryResult={queryResult} />
        </div>
      )}
    </div>
  );
};
