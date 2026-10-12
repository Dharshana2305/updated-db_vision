import React, { useState, useRef } from 'react';
import {
  FolderKanban,
  Plus,
  Trash2,
  CheckCircle2,
  Database,
  Calendar,
  Layers,
  ArrowRight,
  HardDrive,
  Server,
  Upload,
  AlertCircle,
  Eye,
  EyeOff,
  Shield,
  FileCode,
  Link,
  Unlink
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';
import { DatabaseType, DatabaseConnectionConfig, Project } from '../types.js';
import { api } from '../api.js';

interface ProjectsPageProps {
  onNavigateToTab: (tab: string) => void;
}

const DEFAULT_PORTS: Record<string, number> = {
  postgresql: 5432,
  postgres: 5432,
  mysql: 3306,
  mariadb: 3306,
  sqlserver: 1433,
  oracle: 1521,
  mongodb: 27017,
  redis: 6379,
  cassandra: 9042
};

export const ProjectsPage: React.FC<ProjectsPageProps> = ({ onNavigateToTab }) => {
  const {
    projects,
    activeProject,
    switchProject,
    createProject,
    deleteProject,
    refreshProjects,
    refreshSchema,
    refreshReviewData
  } = useProject();

  // Modal for new workspace creation
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dbMode, setDbMode] = useState<'none' | 'file' | 'server'>('file');

  // File upload state in modal
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Server credentials in modal
  const [dbType, setDbType] = useState<DatabaseType>('postgresql');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState<number>(5432);
  const [database, setDatabase] = useState('production_db');
  const [username, setUsername] = useState('postgres');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [readOnly, setReadOnly] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Dedicated Connect Database Modal for existing workspace
  const [connectModalProject, setConnectModalProject] = useState<Project | null>(null);
  const [connectModalMode, setConnectModalMode] = useState<'file' | 'server'>('file');
  const [modalFile, setModalFile] = useState<File | null>(null);
  const modalFileInputRef = useRef<HTMLInputElement | null>(null);
  const [modalDbType, setModalDbType] = useState<DatabaseType>('postgresql');
  const [modalHost, setModalHost] = useState('localhost');
  const [modalPort, setModalPort] = useState<number>(5432);
  const [modalDatabase, setModalDatabase] = useState('production_db');
  const [modalUsername, setModalUsername] = useState('postgres');
  const [modalPassword, setModalPassword] = useState('');
  const [modalShowPassword, setModalShowPassword] = useState(false);
  const [modalReadOnly, setModalReadOnly] = useState(true);
  const [connectModalLoading, setConnectModalLoading] = useState(false);
  const [connectModalFeedback, setConnectModalFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleEngineChange = (type: DatabaseType) => {
    setDbType(type);
    if (DEFAULT_PORTS[type]) {
      setPort(DEFAULT_PORTS[type]);
    }
  };

  const handleModalEngineChange = (type: DatabaseType) => {
    setModalDbType(type);
    if (DEFAULT_PORTS[type]) {
      setModalPort(DEFAULT_PORTS[type]);
    }
  };

  const handleConnectClick = (p: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    switchProject(p.id);
    setConnectModalProject(p);
    const isFileDb = p.databaseType === 'sqlite';
    setConnectModalMode(isFileDb ? 'file' : 'server');
    setModalDbType(p.databaseType !== 'sqlite' ? p.databaseType : 'postgresql');
    setModalPort(DEFAULT_PORTS[p.databaseType !== 'sqlite' ? p.databaseType : 'postgresql'] || 5432);
    setModalDatabase(p.connectionConfig?.database || p.connectionConfig?.databaseName || 'production_db');
    setModalUsername(p.connectionConfig?.username || 'postgres');
    setModalHost(p.connectionConfig?.host || 'localhost');
    setModalPassword('');
    setModalFile(null);
    setConnectModalFeedback(null);
  };

  const handleConnectModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectModalProject) return;
    setConnectModalLoading(true);
    setConnectModalFeedback(null);

    try {
      if (connectModalMode === 'file') {
        if (!modalFile) {
          setConnectModalFeedback({
            type: 'error',
            text: 'Please select a database file (.sql, .db, .sqlite, .sqlite3).'
          });
          setConnectModalLoading(false);
          return;
        }

        const extMatch = modalFile.name.match(/\.(sql|db|sqlite|sqlite3)$/i);
        if (!extMatch) {
          setConnectModalFeedback({
            type: 'error',
            text: 'Unsupported file format. Supported extensions: .sql, .db, .sqlite, .sqlite3.'
          });
          setConnectModalLoading(false);
          return;
        }

        const res = await api.uploadDatabaseFile(connectModalProject.id, modalFile);
        setConnectModalFeedback({
          type: 'success',
          text: res.message || `File "${modalFile.name}" connected and saved to workspace "${connectModalProject.name}"!`
        });
      } else {
        const config: DatabaseConnectionConfig = {
          type: modalDbType,
          host: modalHost.trim(),
          port: Number(modalPort),
          database: modalDatabase.trim(),
          databaseName: modalDatabase.trim(),
          username: modalUsername.trim(),
          password: modalPassword,
          readOnly: modalReadOnly
        };

        const res = await api.connectDatabase(connectModalProject.id, config);
        if (res.success) {
          setConnectModalFeedback({
            type: 'success',
            text: res.message || `Successfully connected and saved to workspace "${connectModalProject.name}"!`
          });
        } else {
          setConnectModalFeedback({
            type: 'error',
            text: res.testResult?.message || res.message || 'Connection test failed. Please verify credentials.'
          });
          await refreshProjects();
          setConnectModalLoading(false);
          return;
        }
      }

      await refreshProjects();
      await refreshSchema();
      await refreshReviewData();

      setTimeout(() => {
        setConnectModalProject(null);
        setModalFile(null);
        setModalPassword('');
        setConnectModalFeedback(null);
      }, 1500);
    } catch (err: any) {
      setConnectModalFeedback({
        type: 'error',
        text: err.message || 'Connection operation failed.'
      });
      await refreshProjects();
    } finally {
      setConnectModalLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const targetEngine = dbMode === 'server' ? dbType : 'sqlite';

      // 1. Create workspace
      const newProj = await createProject({
        name: name.trim(),
        description: description.trim(),
        databaseType: targetEngine
      });

      // 2. Connect database if configured
      if (dbMode === 'file' && selectedFile) {
        await api.uploadDatabaseFile(newProj.id, selectedFile);
      } else if (dbMode === 'server') {
        const config: DatabaseConnectionConfig = {
          type: dbType,
          host: host.trim(),
          port: Number(port),
          database: database.trim(),
          databaseName: database.trim(),
          username: username.trim(),
          password,
          readOnly
        };
        await api.connectDatabase(newProj.id, config);
      }

      await refreshProjects();
      await refreshSchema();
      await refreshReviewData();

      // Reset form
      setName('');
      setDescription('');
      setSelectedFile(null);
      setPassword('');
      setShowModal(false);
    } catch (err: any) {
      console.error(`Project creation failed: ${err.message}`);
      setErrorMsg(`Workspace setup error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this workspace and all associated audits?')) {
      return;
    }
    try {
      await deleteProject(id);
    } catch (err: any) {
      console.error(`Delete failed: ${err.message}`);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <FolderKanban className="w-6 h-6 text-sky-400" />
            <span>Project Workspaces</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Organize database connections, audit findings, and autonomous remediation milestones per workspace.
          </p>
        </div>

        <button
          onClick={() => {
            setShowModal(true);
            setErrorMsg(null);
          }}
          className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-sky-600/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Workspace</span>
        </button>
      </div>

      {/* Workspaces Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map(p => {
          const isActive = activeProject?.id === p.id;
          const isConnected = p.connectionStatus === 'CONNECTED';
          const isError = p.connectionStatus === 'ERROR';

          return (
            <div
              key={p.id}
              onClick={() => switchProject(p.id)}
              className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between transition-all cursor-pointer ${
                isActive
                  ? 'border-sky-500 shadow-lg shadow-sky-500/10'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="space-y-3">
                {/* Engine Badge and Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 uppercase font-mono">
                      {p.databaseType}
                    </span>
                    {/* Connection Status Badge */}
                    {isConnected ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        CONNECTED
                      </span>
                    ) : isError ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        ERROR
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                        NOT CONNECTED
                      </span>
                    )}
                  </div>

                  {isActive ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-sky-400" /> ACTIVE
                    </span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        switchProject(p.id);
                      }}
                      className="text-xs text-slate-400 hover:text-sky-400 transition-colors cursor-pointer"
                    >
                      Make Active &rarr;
                    </button>
                  )}
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-100">{p.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {p.description || 'No description provided.'}
                  </p>
                </div>

                {/* Connection Target Details */}
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                  <span className="truncate">
                    {p.connectionConfig?.name ? (
                      <span className="text-slate-300 font-mono">📁 {p.connectionConfig.name}</span>
                    ) : p.connectionConfig?.database ? (
                      <span className="text-slate-300 font-mono">🌐 {p.connectionConfig.host}:{p.connectionConfig.port}/{p.connectionConfig.database}</span>
                    ) : (
                      <span className="text-slate-500 italic">No database configured</span>
                    )}
                  </span>
                  {p.latestHealthScore && (
                    <span className="font-mono text-sky-400 font-bold ml-2">
                      Score: {p.latestHealthScore.overall}/100
                    </span>
                  )}
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-mono text-[11px]">
                  {new Date(p.createdAt).toLocaleDateString()}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleConnectClick(p, e)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 font-semibold text-xs flex items-center gap-1 cursor-pointer"
                    title="Connect or configure database for this workspace"
                  >
                    <Link className="w-3 h-3" />
                    <span>{isConnected ? 'Manage DB' : 'Connect DB'}</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      switchProject(p.id);
                      onNavigateToTab('dashboard');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>Open</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>

                  <button
                    onClick={(e) => handleDelete(p.id, e)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
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

      {/* New Project Workspace Modal with Guided Connection Flow */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl my-8">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-sky-400" />
                <span>Create New Project Workspace</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure your workspace details and connect your target database in one step.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              {/* Workspace Name & Description */}
              <div>
                <label className="block text-slate-300 font-medium mb-1">Workspace Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Healthcare System Audit"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-sky-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Target database context or audit scope..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-sky-500 text-xs"
                />
              </div>

              {/* Database Connection Mode Selector */}
              <div>
                <label className="block text-slate-300 font-medium mb-2">Connect Database</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDbMode('file')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      dbMode === 'file'
                        ? 'bg-sky-500/15 border-sky-400 text-sky-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <HardDrive className="w-4 h-4 mx-auto mb-1 text-sky-400" />
                    <span className="block text-[11px]">File-Based</span>
                    <span className="block text-[9px] text-slate-500">.sql, .db, .sqlite, .sqlite3</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDbMode('server')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      dbMode === 'server'
                        ? 'bg-emerald-500/15 border-emerald-400 text-emerald-300 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Server className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                    <span className="block text-[11px]">Server-Based</span>
                    <span className="block text-[9px] text-slate-500">Postgres, MySQL...</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDbMode('none')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      dbMode === 'none'
                        ? 'bg-slate-800 border-slate-600 text-slate-200 font-bold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Database className="w-4 h-4 mx-auto mb-1 text-slate-400" />
                    <span className="block text-[11px]">Connect Later</span>
                    <span className="block text-[9px] text-slate-500">Empty Workspace</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Option 1: File-based database upload */}
              {dbMode === 'file' && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 text-xs flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-sky-400" />
                      Select Database File (.sql, .db, .sqlite, .sqlite3)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">Max 150MB</span>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".sql,.sqlite,.db,.sqlite3"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setSelectedFile(file);
                    }}
                    className="hidden"
                  />

                  {selectedFile ? (
                    <div className="p-2.5 rounded-lg bg-sky-950/40 border border-sky-500/30 flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="font-mono text-sky-300 font-semibold truncate">{selectedFile.name}</span>
                        <span className="text-[10px] text-slate-400">({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedFile(null)}
                        className="text-xs text-rose-400 hover:text-rose-300 ml-2 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-3 rounded-lg border border-dashed border-slate-700 hover:border-sky-500 text-slate-300 hover:text-sky-300 text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <Upload className="w-4 h-4 text-sky-400" />
                      <span>Choose .sql, .db, .sqlite, or .sqlite3 file</span>
                    </button>
                  )}
                  <p className="text-[10px] text-slate-500">
                    If no file is chosen now, a database file or server connection can be added anytime.
                  </p>
                </div>
              )}

              {/* Dynamic Option 2: Server-based database connection form */}
              {dbMode === 'server' && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Database Type</label>
                      <select
                        value={dbType}
                        onChange={e => handleEngineChange(e.target.value as DatabaseType)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500 cursor-pointer"
                      >
                        <option value="postgresql">PostgreSQL</option>
                        <option value="mysql">MySQL</option>
                        <option value="mariadb">MariaDB</option>
                        <option value="sqlserver">SQL Server</option>
                        <option value="oracle">Oracle</option>
                        <option value="mongodb">MongoDB</option>
                        <option value="redis">Redis</option>
                        <option value="cassandra">Cassandra</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Host</label>
                      <input
                        type="text"
                        value={host}
                        onChange={e => setHost(e.target.value)}
                        placeholder="localhost"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Port</label>
                      <input
                        type="number"
                        value={port}
                        onChange={e => setPort(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Database Name</label>
                      <input
                        type="text"
                        value={database}
                        onChange={e => setDatabase(e.target.value)}
                        placeholder="production_db"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Username</label>
                      <input
                        type="text"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        placeholder="postgres"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-2.5 py-1.5 pr-8 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Creating & Connecting...' : 'Create Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dedicated Connect Database Modal for Existing Workspace */}
      {connectModalProject && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl my-8">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-sky-400" />
                  <h3 className="text-base font-bold text-slate-100">
                    Connect Target Database
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Workspace: <strong className="text-sky-300">{connectModalProject.name}</strong>
                </p>
              </div>

              {/* Current Connection Status Badge */}
              <div>
                {connectModalProject.connectionStatus === 'CONNECTED' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    CONNECTED
                  </span>
                ) : connectModalProject.connectionStatus === 'ERROR' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    ERROR
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    NOT CONNECTED
                  </span>
                )}
              </div>
            </div>

            {/* Feedback message */}
            {connectModalFeedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  connectModalFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                }`}
              >
                {connectModalFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                )}
                <span>{connectModalFeedback.text}</span>
              </div>
            )}

            <form onSubmit={handleConnectModalSubmit} className="space-y-4 text-xs">
              {/* Database Category Selector: File-based vs Server-based */}
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Select Database Category</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConnectModalMode('file')}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      connectModalMode === 'file'
                        ? 'bg-sky-500/15 border-sky-400 text-sky-300 font-bold shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <HardDrive className="w-4 h-4 mx-auto mb-1 text-sky-400" />
                    <span className="block text-xs font-semibold">File-Based Database</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5 font-mono">.sql, .db, .sqlite, .sqlite3</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConnectModalMode('server')}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      connectModalMode === 'server'
                        ? 'bg-emerald-500/15 border-emerald-400 text-emerald-300 font-bold shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Server className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                    <span className="block text-xs font-semibold">Server-Based Database</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5 font-mono">Postgres, MySQL, Multi-DB</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Option 1: File-Based Database Upload */}
              {connectModalMode === 'file' && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 text-xs flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-sky-400" />
                      Select Database File (.sql, .db, .sqlite, .sqlite3)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">Max 150MB</span>
                  </div>

                  <input
                    ref={modalFileInputRef}
                    type="file"
                    accept=".sql,.sqlite,.db,.sqlite3"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setModalFile(file);
                    }}
                    className="hidden"
                  />

                  {modalFile ? (
                    <div className="p-3 rounded-lg bg-sky-950/40 border border-sky-500/30 flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="font-mono text-sky-300 font-semibold truncate">{modalFile.name}</span>
                        <span className="text-[10px] text-slate-400">({(modalFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setModalFile(null);
                          if (modalFileInputRef.current) modalFileInputRef.current.value = '';
                        }}
                        className="text-xs text-rose-400 hover:text-rose-300 ml-2 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => modalFileInputRef.current?.click()}
                      className="w-full py-4 rounded-lg border border-dashed border-slate-700 hover:border-sky-500 text-slate-300 hover:text-sky-300 text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <Upload className="w-4 h-4 text-sky-400" />
                      <span>Choose .sql, .db, .sqlite, or .sqlite3 file</span>
                    </button>
                  )}

                  <div className="flex items-center justify-center gap-1.5 pt-1 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 text-[9px] font-mono text-slate-400 border border-slate-800">.sql</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 text-[9px] font-mono text-slate-400 border border-slate-800">.db</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 text-[9px] font-mono text-slate-400 border border-slate-800">.sqlite</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 text-[9px] font-mono text-slate-400 border border-slate-800">.sqlite3</span>
                  </div>
                </div>
              )}

              {/* Dynamic Option 2: Server-Based Database Connection Form */}
              {connectModalMode === 'server' && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Database Type</label>
                      <select
                        value={modalDbType}
                        onChange={e => handleModalEngineChange(e.target.value as DatabaseType)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500 cursor-pointer"
                      >
                        <option value="postgresql">PostgreSQL</option>
                        <option value="mysql">MySQL</option>
                        <option value="mariadb">MariaDB</option>
                        <option value="sqlserver">SQL Server</option>
                        <option value="oracle">Oracle</option>
                        <option value="mongodb">MongoDB</option>
                        <option value="redis">Redis</option>
                        <option value="cassandra">Cassandra</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Host</label>
                      <input
                        type="text"
                        value={modalHost}
                        onChange={e => setModalHost(e.target.value)}
                        placeholder="localhost"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Port</label>
                      <input
                        type="number"
                        value={modalPort}
                        onChange={e => setModalPort(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Database Name</label>
                      <input
                        type="text"
                        value={modalDatabase}
                        onChange={e => setModalDatabase(e.target.value)}
                        placeholder="production_db"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Username</label>
                      <input
                        type="text"
                        value={modalUsername}
                        onChange={e => setModalUsername(e.target.value)}
                        placeholder="postgres"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">Password</label>
                      <div className="relative">
                        <input
                          type={modalShowPassword ? 'text' : 'password'}
                          value={modalPassword}
                          onChange={e => setModalPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-2.5 py-1.5 pr-8 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                        />
                        <button
                          type="button"
                          onClick={() => setModalShowPassword(!modalShowPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          {modalShowPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setConnectModalProject(null);
                    onNavigateToTab('connection');
                  }}
                  className="text-xs text-sky-400 hover:text-sky-300 underline cursor-pointer"
                >
                  Open in Connection Hub &rarr;
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConnectModalProject(null)}
                    className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={connectModalLoading || (connectModalMode === 'file' && !modalFile) || (connectModalMode === 'server' && !modalDatabase.trim())}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {connectModalLoading ? 'Connecting & Saving...' : 'Connect & Save'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
