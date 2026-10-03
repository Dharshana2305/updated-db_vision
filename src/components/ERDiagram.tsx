import React, { useState, useMemo, useRef } from 'react';
import {
  DatabaseSchema,
  TableMetadata,
  Finding
} from '../types.js';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Key,
  Link,
  AlertTriangle,
  X,
  Search
} from 'lucide-react';
import { SeverityBadge } from './SeverityBadge.js';

interface ERDiagramProps {
  schema: DatabaseSchema;
  findings?: Finding[];
}

interface TablePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ERDiagram: React.FC<ERDiagramProps> = ({ schema, findings = [] }) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 30, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedTable, setSelectedTable] = useState<TableMetadata | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Group findings by table name
  const findingsByTable = useMemo(() => {
    const map: Record<string, Finding[]> = {};
    for (const f of findings) {
      if (!map[f.table]) map[f.table] = [];
      map[f.table].push(f);
    }
    return map;
  }, [findings]);

  // Layout tables in an adaptive grid
  const { tablePositions, relationships } = useMemo(() => {
    const positions: Record<string, TablePosition> = {};
    const cols = Math.max(2, Math.ceil(Math.sqrt(schema.tables.length)));
    const cardWidth = 260;
    const paddingX = 70;
    const paddingY = 60;

    let col = 0;
    let row = 0;

    for (const table of schema.tables) {
      const headerHeight = 44;
      const rowHeight = 26;
      const cardHeight = headerHeight + Math.min(table.columns.length, 12) * rowHeight + 20;

      positions[table.name] = {
        x: col * (cardWidth + paddingX),
        y: row * 380,
        width: cardWidth,
        height: cardHeight
      };

      col++;
      if (col >= cols) {
        col = 0;
        row++;
      }
    }

    // Build connections from Foreign Keys
    const rels: Array<{ from: string; to: string; colName: string; refCol: string; inferred?: boolean; confidence?: number }> = [];
    for (const table of schema.tables) {
      for (const fk of table.foreignKeys) {
        if (positions[fk.referencedTable]) {
          rels.push({
            from: table.name,
            to: fk.referencedTable,
            colName: fk.columnName,
            refCol: fk.referencedColumn,
            inferred: Boolean(fk.inferred),
            confidence: fk.confidence
          });
        }
      }
    }

    return { tablePositions: positions, relationships: rels };
  }, [schema]);

  // Pan controls
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).id === 'erd-canvas-bg') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  // SVG Export
  const handleExportSvg = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${schema.databaseName}-er-diagram.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredTables = schema.tables.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden select-none">
      {/* Top Toolbar */}
      <div className="h-12 border-b border-slate-800 bg-slate-900/90 px-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter tables..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 pl-8 pr-3 py-1 rounded-lg focus:outline-none focus:border-sky-500 w-44"
            />
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {schema.tables.length} tables &bull; {relationships.length} relationships
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setZoom(z => Math.min(2, z + 0.15))}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 30, y: 30 });
            }}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-slate-800 mx-1"></div>
          <button
            onClick={handleExportSvg}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export SVG
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div
        className="flex-1 w-full h-full cursor-grab active:cursor-grabbing overflow-hidden relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <svg
          ref={svgRef}
          className="w-full h-full"
          id="erd-canvas"
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#0284c7" />
            </marker>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.8" opacity="0.6" />
            </pattern>
          </defs>

          {/* Grid background */}
          <rect id="erd-canvas-bg" width="100%" height="100%" fill="url(#grid)" />

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Relationship Lines */}
            {relationships.map((rel, idx) => {
              const fromPos = tablePositions[rel.from];
              const toPos = tablePositions[rel.to];
              if (!fromPos || !toPos) return null;

              const x1 = fromPos.x + fromPos.width;
              const y1 = fromPos.y + 60;
              const x2 = toPos.x;
              const y2 = toPos.y + 60;
              const midX = (x1 + x2) / 2;

              const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

              const isInferred = Boolean(rel.inferred);
              return (
                <g key={`rel-${idx}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke={isInferred ? '#c084fc' : '#0284c7'}
                    strokeWidth={isInferred ? '1.5' : '2'}
                    strokeDasharray={isInferred ? '6,3' : 'none'}
                    markerEnd="url(#arrow)"
                    opacity="0.85"
                  />
                  <text
                    x={midX}
                    y={(y1 + y2) / 2 - 4}
                    textAnchor="middle"
                    className={`text-[9px] font-mono font-semibold ${isInferred ? 'fill-purple-400' : 'fill-sky-400'}`}
                  >
                    {isInferred ? 'AI-INFERRED' : 'REAL FK'}
                  </text>
                </g>
              );
            })}

            {/* Table Cards */}
            {filteredTables.map(table => {
              const pos = tablePositions[table.name];
              if (!pos) return null;

              const tableFindings = findingsByTable[table.name] || [];
              const hasCritical = tableFindings.some(f => f.severity === 'CRITICAL');
              const hasWarning = tableFindings.length > 0;
              const isSelected = selectedTable?.name === table.name;

              return (
                <g
                  key={table.name}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  className="cursor-pointer"
                  onClick={() => setSelectedTable(table)}
                >
                  {/* Outer container */}
                  <rect
                    width={pos.width}
                    height={pos.height}
                    rx="8"
                    className={`transition-colors duration-150 ${
                      isSelected
                        ? 'fill-slate-900 stroke-sky-400 stroke-2'
                        : hasCritical
                        ? 'fill-slate-900 stroke-rose-500/80 stroke-2'
                        : hasWarning
                        ? 'fill-slate-900 stroke-amber-500/60 stroke-1.5'
                        : 'fill-slate-900 stroke-slate-800 stroke-1 hover:stroke-slate-600'
                    }`}
                  />

                  {/* Header Bar */}
                  <rect
                    width={pos.width}
                    height="40"
                    rx="8"
                    className={`fill-slate-800/80`}
                  />
                  <rect
                    y="32"
                    width={pos.width}
                    height="8"
                    className={`fill-slate-800/80`}
                  />

                  {/* Table Title */}
                  <text
                    x="12"
                    y="25"
                    className="fill-slate-100 font-bold text-xs font-mono"
                  >
                    {table.name}
                  </text>

                  {/* Row count pill */}
                  <text
                    x={pos.width - 12}
                    y="25"
                    textAnchor="end"
                    className="fill-slate-400 text-[10px] font-mono"
                  >
                    {table.rowCount} rows
                  </text>

                  {/* Warning indicator badge */}
                  {tableFindings.length > 0 && (
                    <circle
                      cx={pos.width - 24}
                      cy="12"
                      r="5"
                      className={hasCritical ? 'fill-rose-500' : 'fill-amber-500'}
                    />
                  )}

                  {/* Columns List */}
                  {table.columns.slice(0, 12).map((col, cIdx) => {
                    const y = 46 + cIdx * 26;
                    return (
                      <g key={col.name}>
                        {/* PK Icon */}
                        {col.isPrimaryKey && (
                          <text x="12" y={y + 14} className="fill-amber-400 text-[10px] font-bold">
                            PK
                          </text>
                        )}
                        {/* FK Icon */}
                        {col.isForeignKey && !col.isPrimaryKey && (
                          <text x="12" y={y + 14} className="fill-sky-400 text-[10px] font-bold">
                            FK
                          </text>
                        )}

                        {/* Column Name */}
                        <text
                          x={col.isPrimaryKey || col.isForeignKey ? '32' : '14'}
                          y={y + 14}
                          className={`text-xs font-mono ${
                            col.isPrimaryKey
                              ? 'fill-amber-300 font-medium'
                              : col.isForeignKey
                              ? 'fill-sky-300'
                              : 'fill-slate-300'
                          }`}
                        >
                          {col.name}
                        </text>

                        {/* Data Type */}
                        <text
                          x={pos.width - 12}
                          y={y + 14}
                          textAnchor="end"
                          className="fill-slate-500 text-[10px] font-mono"
                        >
                          {col.dataType}
                        </text>

                        {/* Divider */}
                        {cIdx < table.columns.length - 1 && (
                          <line
                            x1="8"
                            y1={y + 24}
                            x2={pos.width - 8}
                            y2={y + 24}
                            stroke="#1e293b"
                            strokeWidth="0.8"
                          />
                        )}
                      </g>
                    );
                  })}

                  {table.columns.length > 12 && (
                    <text
                      x={pos.width / 2}
                      y={pos.height - 8}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-mono italic"
                    >
                      + {table.columns.length - 12} more columns...
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Table Selection Sidebar / Drawer */}
        {selectedTable && (
          <div className="absolute right-4 top-4 bottom-4 w-96 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl p-4 overflow-y-auto z-20 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-100 font-mono text-sm">{selectedTable.name}</h3>
                <p className="text-xs text-slate-400">
                  {selectedTable.type.toUpperCase()} &bull; {selectedTable.rowCount} rows &bull; {selectedTable.columns.length} columns
                </p>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Findings on this table */}
            {findingsByTable[selectedTable.name] && (
              <div className="my-4 space-y-2">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  Table Flaws & Vulnerabilities ({findingsByTable[selectedTable.name].length})
                </div>
                <div className="space-y-1.5">
                  {findingsByTable[selectedTable.name].map(f => (
                    <div key={f.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-200 truncate">{f.title}</span>
                        <SeverityBadge severity={f.severity} size="sm" />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{f.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Columns Details */}
            <div className="mt-4">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Attribute Schema ({selectedTable.columns.length})
              </div>
              <div className="space-y-1 font-mono text-xs">
                {selectedTable.columns.map(col => (
                  <div key={col.name} className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {col.isPrimaryKey && <Key className="w-3 h-3 text-amber-400" />}
                        {col.isForeignKey && <Link className="w-3 h-3 text-sky-400" />}
                        <span className="text-slate-200 font-medium">{col.name}</span>
                      </div>
                      <span className="text-[11px] text-sky-400">{col.dataType}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1">
                      <span>Nullable: {col.nullable ? 'YES' : 'NO'}</span>
                      {col.nullPercentage !== undefined && <span>NULL: {col.nullPercentage}%</span>}
                      {col.distinctCount !== undefined && <span>Distinct: {col.distinctCount}</span>}
                    </div>
                    {col.piiFlag && (
                      <div className="mt-1">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-semibold border border-rose-500/30">
                          PII: {col.piiFlag.type}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Foreign Keys */}
            {selectedTable.foreignKeys.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Foreign Key Constraints ({selectedTable.foreignKeys.length})
                </div>
                <div className="space-y-1 text-xs font-mono">
                  {selectedTable.foreignKeys.map((fk, i) => (
                    <div key={i} className="p-2 rounded bg-slate-950/60 border border-slate-800 text-slate-300">
                      <code>{fk.columnName}</code> &rarr; <code>{fk.referencedTable}.{fk.referencedColumn}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
