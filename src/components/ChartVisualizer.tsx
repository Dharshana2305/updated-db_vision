import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import { BarChart3, LineChart as LineIcon, PieChart as PieIcon, Table as TableIcon } from 'lucide-react';
import { QueryResult } from '../types.js';

interface ChartVisualizerProps {
  queryResult: QueryResult;
}

const COLORS = ['#0284c7', '#38bdf8', '#34d399', '#f59e0b', '#ec4899', '#8b5cf6', '#6366f1'];

export const ChartVisualizer: React.FC<ChartVisualizerProps> = ({ queryResult }) => {
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie' | 'table'>('table');

  const { rows, columns } = queryResult;

  // Detect numeric and label columns automatically
  const { labelCol, numericCol } = useMemo(() => {
    if (!rows || rows.length === 0) return { labelCol: '', numericCol: '' };
    const firstRow = rows[0];

    let lCol = '';
    let nCol = '';

    for (const col of columns) {
      const val = firstRow[col];
      if (typeof val === 'number' || (!isNaN(Number(val)) && val !== '')) {
        if (!nCol) nCol = col;
      } else {
        if (!lCol) lCol = col;
      }
    }

    if (!lCol && columns.length > 0) lCol = columns[0];
    if (!nCol && columns.length > 1) nCol = columns[1];

    return { labelCol: lCol, numericCol: nCol };
  }, [rows, columns]);

  // Transform rows for recharts
  const chartData = useMemo(() => {
    if (!rows || rows.length === 0 || !numericCol) return [];
    return rows.slice(0, 20).map(row => ({
      name: String(row[labelCol] ?? 'N/A'),
      value: Number(row[numericCol]) || 0
    }));
  }, [rows, labelCol, numericCol]);

  const canChart = chartData.length > 0 && Boolean(numericCol);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300">Data View:</span>
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setChartType('table')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
                chartType === 'table' ? 'bg-slate-800 text-sky-400 font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              Table
            </button>
            {canChart && (
              <>
                <button
                  onClick={() => setChartType('bar')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
                    chartType === 'bar' ? 'bg-slate-800 text-sky-400 font-medium' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Bar
                </button>
                <button
                  onClick={() => setChartType('line')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
                    chartType === 'line' ? 'bg-slate-800 text-sky-400 font-medium' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LineIcon className="w-3.5 h-3.5" />
                  Line
                </button>
                <button
                  onClick={() => setChartType('pie')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
                    chartType === 'pie' ? 'bg-slate-800 text-sky-400 font-medium' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <PieIcon className="w-3.5 h-3.5" />
                  Pie
                </button>
              </>
            )}
          </div>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          {queryResult.rowCount} rows &bull; {queryResult.executionTimeMs}ms
        </div>
      </div>

      {/* Render Table or Chart */}
      {chartType === 'table' ? (
        <div className="overflow-x-auto max-h-80 border border-slate-800/80 rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950/90 sticky top-0 border-b border-slate-800">
              <tr>
                {columns.map(c => (
                  <th key={c} className="p-2.5 font-semibold text-slate-300 uppercase tracking-wider font-mono text-[11px]">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 bg-slate-900/40 font-mono text-[11px]">
              {rows.slice(0, 100).map((r, i) => (
                <tr key={i} className="hover:bg-slate-800/40">
                  {columns.map(c => (
                    <td key={c} className="p-2.5 text-slate-300 truncate max-w-xs">
                      {r[c] === null ? (
                        <span className="text-slate-600 italic">NULL</span>
                      ) : (
                        String(r[c])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                />
                <Bar dataKey="value" fill="#0284c7" radius={[4, 4, 0, 0]} name={numericCol} />
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                />
                <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} name={numericCol} />
              </LineChart>
            ) : (
              <PieChart>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                />
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
