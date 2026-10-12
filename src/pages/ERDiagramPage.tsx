import React from 'react';
import { useProject } from '../context/ProjectContext.js';
import { ERDiagram } from '../components/ERDiagram.js';
import { Database, GitGraph } from 'lucide-react';

export const ERDiagramPage: React.FC = () => {
  const { schema, latestReview } = useProject();

  if (!schema) {
    return (
      <div className="p-12 text-center text-slate-500 space-y-3">
        <Database className="w-12 h-12 mx-auto text-slate-700" />
        <h3 className="text-base font-semibold text-slate-300">Database Schema Not Available</h3>
        <p className="text-xs">Please connect your workspace to a database (.sql, .db, .sqlite, .sqlite3, or live server) first.</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] p-4 flex flex-col space-y-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <GitGraph className="w-5 h-5 text-sky-400" />
          <h1 className="text-lg font-bold text-slate-100">Interactive Entity-Relationship Diagram</h1>
        </div>
        <div className="text-xs text-slate-400 font-mono">
          Drag canvas to Pan &bull; Click card to inspect columns &amp; foreign keys
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ERDiagram schema={schema} findings={latestReview?.findings} />
      </div>
    </div>
  );
};
