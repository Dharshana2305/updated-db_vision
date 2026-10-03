import React, { useState, useEffect } from 'react';
import {
  Database,
  ChevronDown,
  Cpu,
  Plus,
  LogOut,
  FolderOpen,
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useProject } from '../context/ProjectContext.js';
import { api } from '../api.js';

interface NavbarProps {
  onOpenNewProjectModal: () => void;
  onNavigateToTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenNewProjectModal, onNavigateToTab }) => {
  const { user, logout } = useAuth();
  const { projects, activeProject, selectProject } = useProject();
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [modelName, setModelName] = useState('llama3.2:3b');

  useEffect(() => {
    api.getSettings()
      .then(res => {
        setModelName(res.settings.ollamaModel);
        return api.testOllama(res.settings.ollamaBaseUrl);
      })
      .then(res => {
        setOllamaStatus(res.health?.available ? 'online' : 'offline');
      })
      .catch(() => {
        setOllamaStatus('offline');
      });
  }, []);

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 flex items-center justify-between">
      {/* Brand */}
      <div className="flex items-center gap-6">
        <div
          onClick={() => onNavigateToTab('dashboard')}
          className="flex items-center gap-2.5 cursor-pointer select-none group"
        >
          <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 group-hover:border-sky-400 transition-colors shadow-sm">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 text-sm tracking-tight group-hover:text-sky-300 transition-colors">
                AI DB Reviewer
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800/50">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Database Optimization & Security Auditor</p>
          </div>
        </div>

        {/* Project Selector Dropdown */}
        <div className="relative">
          <button
            id="btn-project-selector"
            onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 hover:border-slate-700 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium max-w-[140px] truncate">
              {activeProject ? activeProject.name : 'Select Project'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {projectDropdownOpen && (
            <div
              className="absolute left-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
              onMouseLeave={() => setProjectDropdownOpen(false)}
            >
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Workspaces ({projects.length})
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5 my-1">
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      selectProject(p);
                      setProjectDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                      activeProject?.id === p.id
                        ? 'bg-sky-500/10 text-sky-400 font-medium'
                        : 'text-slate-300 hover:bg-slate-800/70'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-[10px] text-slate-500 uppercase">{p.databaseType}</span>
                  </button>
                ))}
              </div>
              <div className="pt-1 border-t border-slate-800 mt-1">
                <button
                  onClick={() => {
                    setProjectDropdownOpen(false);
                    onOpenNewProjectModal();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-sky-400 hover:bg-sky-500/10 transition-colors font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create New Project
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Side: DB Indicator, Ollama AI Status, User profile */}
      <div className="flex items-center gap-3">
        {/* Active Database Status Pill */}
        {activeProject && (
          <div
            onClick={() => onNavigateToTab('connection')}
            className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300 cursor-pointer hover:border-slate-700"
            title="Database Connection Status"
          >
            {activeProject.connectionStatus === 'CONNECTED' ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            )}
            <span className="font-mono text-[11px] text-slate-300">
              {activeProject.connectionConfig?.name || activeProject.databaseType.toUpperCase()}
            </span>
          </div>
        )}

        {/* AI Engine Status Pill */}
        <div
          onClick={() => onNavigateToTab('settings')}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs cursor-pointer hover:border-slate-700"
          title={`AI Engine: ${ollamaStatus === 'online' ? `Ollama (${modelName})` : 'Deterministic Fallback Engine'}`}
        >
          <Cpu className={`w-3.5 h-3.5 ${ollamaStatus === 'online' ? 'text-emerald-400' : 'text-sky-400'}`} />
          <span className="text-[11px] text-slate-300 font-medium">
            {ollamaStatus === 'online' ? `Ollama (${modelName})` : 'AI Engine: Active'}
          </span>
          {ollamaStatus === 'online' ? (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
          )}
        </div>

        {/* User Profile dropdown */}
        {user && (
          <div className="relative">
            <button
              id="btn-user-profile"
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-lg hover:bg-slate-800/80 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-sky-600/30 border border-sky-500/50 flex items-center justify-center text-xs font-bold text-sky-300">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {userDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-1.5 z-50"
                onMouseLeave={() => setUserDropdownOpen(false)}
              >
                <div className="px-3 py-2 border-b border-slate-800">
                  <p className="text-xs font-semibold text-slate-200 truncate">{user.name}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{user.email}</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      onNavigateToTab('settings');
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 rounded-lg"
                  >
                    Settings & AI Models
                  </button>
                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      logout();
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg flex items-center gap-2 mt-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
