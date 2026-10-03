import React, { useState } from 'react';
import {
  FolderKanban,
  Plus,
  Trash2,
  CheckCircle2,
  Database,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';
import { DatabaseType } from '../types.js';

interface ProjectsPageProps {
  onNavigateToTab: (tab: string) => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({ onNavigateToTab }) => {
  const { projects, activeProject, switchProject, createProject, deleteProject } = useProject();

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [databaseType, setDatabaseType] = useState<DatabaseType>('sqlite');
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await createProject({
        name: name.trim(),
        description: description.trim(),
        databaseType
      });
      setName('');
      setDescription('');
      setShowModal(false);
    } catch (err: any) {
      alert(`Project creation failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete project "${name}"?`)) {
      try {
        await deleteProject(id);
      } catch (err: any) {
        alert(`Delete failed: ${err.message}`);
      }
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Project Workspaces</h1>
          <p className="text-xs text-slate-400 mt-1">
            Organize separate databases, audit histories, and remediation milestones
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-sky-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>New Project Workspace</span>
        </button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map(p => {
          const isActive = activeProject?.id === p.id;

          return (
            <div
              key={p.id}
              className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between transition-all ${
                isActive
                  ? 'border-sky-500 shadow-lg shadow-sky-500/10'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 uppercase font-mono">
                    {p.databaseType}
                  </span>
                  {isActive ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> ACTIVE
                    </span>
                  ) : (
                    <button
                      onClick={() => switchProject(p.id)}
                      className="text-xs text-slate-400 hover:text-sky-400 transition-colors"
                    >
                      Switch to this &rarr;
                    </button>
                  )}
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-100">{p.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {p.description || 'No description provided.'}
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-mono text-[11px]">
                  Created {new Date(p.createdAt).toLocaleDateString()}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      switchProject(p.id);
                      onNavigateToTab('dashboard');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1"
                  >
                    <span>Open</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Delete Project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* New Project Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100">Create New Project</h3>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Healthcare System Audit"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Target database context or audit scope..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Target Engine</label>
                <select
                  value={databaseType}
                  onChange={e => setDatabaseType(e.target.value as DatabaseType)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="sqlite">SQLite (Local Embedded)</option>
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="sqlserver">Microsoft SQL Server</option>
                  <option value="oracle">Oracle</option>
                  <option value="mongodb">MongoDB</option>
                  <option value="redis">Redis</option>
                  <option value="cassandra">Apache Cassandra</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
