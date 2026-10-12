import React, { useState, useRef } from 'react';
import {
  Database,
  Upload,
  Server,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Shield,
  Layers,
  ArrowRight,
  Eye,
  EyeOff,
  FolderKanban,
  Unlink,
  RefreshCw,
  HardDrive,
  FileText
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';
import { api } from '../api.js';
import { DatabaseConnectionConfig, DatabaseType } from '../types.js';

interface ConnectionPageProps {
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

export const ConnectionPage: React.FC<ConnectionPageProps> = ({ onNavigateToTab }) => {
  const {
    projects,
    activeProject,
    switchProject,
    refreshProjects,
    refreshSchema,
    refreshReviewData
  } = useProject();

  // Mode: file-based vs server-based database
  const [connectionMode, setConnectionMode] = useState<'file' | 'server'>('file');

  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    percent: number;
    currentMb: number;
    totalMb: number;
    chunkIndex: number;
    totalChunks: number;
  } | null>(null);

  // Form for server credentials
  const [dbType, setDbType] = useState<DatabaseType>('postgresql');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState<number>(5432);
  const [database, setDatabase] = useState('production_db');
  const [username, setUsername] = useState('postgres');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Update default port when engine changes
  const handleEngineChange = (type: DatabaseType) => {
    setDbType(type);
    if (DEFAULT_PORTS[type]) {
      setPort(DEFAULT_PORTS[type]);
    }
  };

  const handleClearForm = () => {
    setHost('localhost');
    setPort(DEFAULT_PORTS[dbType] || 5432);
    setDatabase('');
    setUsername('');
    setPassword('');
    setStatusMessage(null);
  };

  const handleDisconnect = async () => {
    if (!activeProject || disconnecting) return;
    setDisconnecting(true);
    setStatusMessage(null);
    try {
      await api.disconnectDatabase(activeProject.id);
      setStatusMessage({ type: 'success', text: `Disconnected database from workspace "${activeProject.name}".` });
      await refreshProjects();
      await refreshSchema();
      await refreshReviewData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to disconnect database' });
    } finally {
      setDisconnecting(false);
    }
  };

  const processUploadFile = async (file: File) => {
    if (!file) return;

    if (!activeProject) {
      setStatusMessage({
        type: 'error',
        text: 'Please select or create a target workspace first before uploading.'
      });
      return;
    }

    // Verify file extension (.sql, .db, .sqlite, .sqlite3)
    const extMatch = file.name.match(/\.(sql|db|sqlite|sqlite3)$/i);
    if (!extMatch) {
      setStatusMessage({
        type: 'error',
        text: `Unsupported file format. Please upload a database file with .sql, .db, .sqlite, or .sqlite3 extension.`
      });
      return;
    }

    // Verify 150MB limit
    const MAX_SIZE_BYTES = 150 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setStatusMessage({
        type: 'error',
        text: `File "${file.name}" is ${sizeMb}MB, which exceeds the maximum allowed 150MB limit.`
      });
      return;
    }

    setLoading(true);
    setStatusMessage(null);
    setUploadProgress(null);

    try {
      const res = await api.uploadDatabaseFile(activeProject.id, file, (progress) => {
        setUploadProgress(progress);
      });
      setStatusMessage({
        type: 'success',
        text: `Database "${file.name}" connected and saved to workspace "${activeProject.name}"! (${(file.size / (1024 * 1024)).toFixed(2)} MB)`
      });
      setStagedFile(null);
      await refreshProjects();
      await refreshSchema();
      await refreshReviewData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Upload failed' });
    } finally {
      setLoading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const extMatch = file.name.match(/\.(sql|db|sqlite|sqlite3)$/i);
      if (!extMatch) {
        setStatusMessage({
          type: 'error',
          text: `Unsupported file format "${file.name}". Supported extensions: .sql, .db, .sqlite, .sqlite3.`
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setStagedFile(file);
      setStatusMessage(null);
    }
  };

  const handleConnectCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) {
      setStatusMessage({ type: 'error', text: 'Please select a target workspace first.' });
      return;
    }
    setLoading(true);
    setStatusMessage(null);

    try {
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

      const res = await api.connectDatabase(activeProject.id, config);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: res.message || `Successfully connected workspace "${activeProject.name}" to ${dbType.toUpperCase()} server!`
        });
        await refreshProjects();
        await refreshSchema();
        await refreshReviewData();
      } else {
        setStatusMessage({
          type: 'error',
          text: res.testResult?.message || res.message || 'Connection test failed. Please verify credentials and network availability.'
        });
        await refreshProjects();
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Connection error' });
      await refreshProjects();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Page Title & Context */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
          <Database className="w-6 h-6 text-sky-400" />
          <span>Workspace Database Connection</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Connect your project workspace to a file-based database (.sql, .db, .sqlite, .sqlite3) or a live server-based database.
        </p>
      </div>

      {/* Target Workspace & Connection Status Banner */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Target Workspace:</span>
                <select
                  value={activeProject?.id || ''}
                  onChange={e => switchProject(e.target.value)}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-sky-300 font-bold focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.databaseType.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-xl truncate">
                {activeProject?.description || 'Active workspace container for database audits and automatic repairs.'}
              </p>
            </div>
          </div>

          {/* Connection Status Pill & Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {activeProject?.connectionStatus === 'CONNECTED' ? (
              <div className="flex items-center gap-2.5">
                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>CONNECTED</span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    ({activeProject.connectionConfig?.name || activeProject.connectionConfig?.database || activeProject.databaseType.toUpperCase()})
                  </span>
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Disconnect Database from Workspace"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Disconnect</span>
                </button>
                <button
                  onClick={() => onNavigateToTab('dashboard')}
                  className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                >
                  <span>Open Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : activeProject?.connectionStatus === 'ERROR' ? (
              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>CONNECTION ERROR</span>
                </div>
              </div>
            ) : (
              <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>NOT CONNECTED</span>
              </div>
            )}
          </div>
        </div>

        {/* Actionable Error details if in error state */}
        {activeProject?.connectionStatus === 'ERROR' && activeProject.connectionError && (
          <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/40 text-xs text-rose-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{activeProject.connectionError}</span>
            </div>
            <span className="text-[11px] text-slate-400">Please re-verify connection settings below</span>
          </div>
        )}
      </div>

      {/* Global Status Message Toast */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-[11px] underline hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Primary Category Selector: File-based vs Server-based */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: File-Based Database */}
        <button
          onClick={() => setConnectionMode('file')}
          className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-4 ${
            connectionMode === 'file'
              ? 'bg-gradient-to-br from-slate-900 to-sky-950/30 border-sky-400 shadow-lg shadow-sky-500/10'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            connectionMode === 'file'
              ? 'bg-sky-500/20 text-sky-400 border border-sky-400/30'
              : 'bg-slate-800 text-slate-400'
          }`}>
            <HardDrive className="w-6 h-6" />
          </div>
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-100">File-Based Database</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold">
                .sql &bull; .db &bull; .sqlite &bull; .sqlite3
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Upload local SQLite database files or SQL DDL scripts up to 150MB. Runs in an isolated sandbox with zero external exposure.
            </p>
          </div>
        </button>

        {/* Card 2: Server-Based Database */}
        <button
          onClick={() => setConnectionMode('server')}
          className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-4 ${
            connectionMode === 'server'
              ? 'bg-gradient-to-br from-slate-900 to-emerald-950/30 border-emerald-400 shadow-lg shadow-emerald-500/10'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            connectionMode === 'server'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/30'
              : 'bg-slate-800 text-slate-400'
          }`}>
            <Server className="w-6 h-6" />
          </div>
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-100">Server-Based Database</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                Postgres &bull; MySQL &bull; Multi-DB
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Connect directly via host, port, credentials, and TLS options to live PostgreSQL, MySQL, MariaDB, SQL Server, Oracle, Mongo, Redis, or Cassandra.
            </p>
          </div>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: FILE-BASED DATABASE WORKFLOW */}
      {/* ========================================================================= */}
      {connectionMode === 'file' && (
        <div className="space-y-4 max-w-2xl mx-auto">
          {stagedFile ? (
                /* Staged File Confirmation Card */
                <div className="bg-slate-900 border border-sky-500/40 rounded-2xl p-6 space-y-4 shadow-xl text-left">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Selected File for Workspace:
                    </span>
                    <span className="text-xs font-mono font-bold text-sky-400">
                      Target: {activeProject?.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                      <FileCode className="w-6 h-6" />
                    </div>
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="font-bold text-slate-100 text-sm truncate font-mono">
                        {stagedFile.name}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{(stagedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                        <span>&bull;</span>
                        <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 font-mono text-[10px] font-bold">
                          .{stagedFile.name.split('.').pop()?.toLowerCase()}
                        </span>
                        <span>&bull;</span>
                        <span className="text-emerald-400 text-[11px] font-medium">Valid File-Based Database</span>
                      </div>
                    </div>
                  </div>

                  {/* Upload Progress during transmission */}
                  {uploadProgress && (
                    <div className="p-4 rounded-xl bg-slate-950/90 border border-sky-500/30 text-left space-y-2.5 shadow-inner animate-in fade-in">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
                          Streaming Chunk {uploadProgress.chunkIndex} of {uploadProgress.totalChunks}
                        </span>
                        <span className="font-mono text-sky-400 font-bold">{uploadProgress.percent}%</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-sky-500 to-emerald-400 h-2.5 rounded-full transition-all duration-300 shadow-sm"
                          style={{ width: `${uploadProgress.percent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>{uploadProgress.currentMb} MB / {uploadProgress.totalMb} MB</span>
                        <span className="text-emerald-400 font-sans">Zero 413 error (8MB chunks)</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setStagedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      disabled={loading}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Choose Different File
                    </button>

                    <button
                      type="button"
                      onClick={() => processUploadFile(stagedFile)}
                      disabled={loading}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white text-xs font-bold transition-all shadow-lg shadow-sky-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Uploading &amp; Connecting...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Upload &amp; Save to {activeProject?.name || 'Workspace'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Drag & Drop Upload Zone */
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      const extMatch = file.name.match(/\.(sql|db|sqlite|sqlite3)$/i);
                      if (!extMatch) {
                        setStatusMessage({
                          type: 'error',
                          text: `Unsupported file format "${file.name}". Supported extensions: .sql, .db, .sqlite, .sqlite3.`
                        });
                        return;
                      }
                      setStagedFile(file);
                    }
                  }}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center space-y-4 transition-all ${
                    isDragging
                      ? 'bg-sky-500/10 border-sky-400 scale-[1.01]'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center mx-auto shadow-inner">
                    <FileCode className="w-8 h-8" />
                  </div>

                  <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-mono font-semibold uppercase">
                      Supports up to 150MB
                    </div>
                    <h3 className="text-base font-bold text-slate-100">
                      Upload Database File to Workspace
                    </h3>
                    <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                      Drag and drop your database file here or click to browse. Supported file types:
                      <strong className="text-sky-300 ml-1">.sql</strong>,
                      <strong className="text-sky-300 ml-1">.db</strong>,
                      <strong className="text-sky-300 ml-1">.sqlite</strong>, and
                      <strong className="text-sky-300 ml-1">.sqlite3</strong>.
                    </p>
                  </div>

                  {/* Hidden File Input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".sql,.sqlite,.db,.sqlite3"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading}
                      className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg transition-all inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer hover:shadow-sky-500/20"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{loading ? 'Uploading & Auditing...' : 'Choose .sql, .db, .sqlite, .sqlite3 File'}</span>
                    </button>
                  </div>

                  {/* Supported format badges */}
                  <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300 border border-slate-700">.sql (DDL / Dump)</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300 border border-slate-700">.db (SQLite)</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300 border border-slate-700">.sqlite (Binary)</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300 border border-slate-700">.sqlite3 (Binary)</span>
                  </div>

                  {/* Interactive Chunked Upload Progress Bar */}
                  {uploadProgress && (
                    <div className="p-4 rounded-xl bg-slate-950/90 border border-sky-500/30 text-left space-y-2.5 max-w-md mx-auto shadow-inner animate-in fade-in">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
                          Streaming Chunk {uploadProgress.chunkIndex} of {uploadProgress.totalChunks}
                        </span>
                        <span className="font-mono text-sky-400 font-bold">{uploadProgress.percent}%</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-sky-500 to-emerald-400 h-2.5 rounded-full transition-all duration-300 shadow-sm"
                          style={{ width: `${uploadProgress.percent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>{uploadProgress.currentMb} MB / {uploadProgress.totalMb} MB</span>
                        <span className="text-emerald-400 font-sans">Zero 413 error (8MB chunks)</span>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-800/80">
                    Uploaded files are saved to workspace <strong>{activeProject?.name}</strong> and isolated within a private sandbox. Zero external data exposure.
                  </p>
                </div>
              )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: SERVER-BASED DATABASE CONNECTION FORM */}
      {/* ========================================================================= */}
      {connectionMode === 'server' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl mx-auto space-y-6 shadow-xl">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                <span>Server Connection Form</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure connection parameters to save to workspace <strong>{activeProject?.name}</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearForm}
              className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
            >
              Clear Form
            </button>
          </div>

          <form onSubmit={handleConnectCredentials} className="space-y-4">
            {/* Database Type & Host */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Database Type</label>
                <select
                  value={dbType}
                  onChange={e => handleEngineChange(e.target.value as DatabaseType)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="postgresql">PostgreSQL (Standard)</option>
                  <option value="mysql">MySQL</option>
                  <option value="mariadb">MariaDB</option>
                  <option value="sqlserver">Microsoft SQL Server</option>
                  <option value="oracle">Oracle Database</option>
                  <option value="mongodb">MongoDB</option>
                  <option value="redis">Redis</option>
                  <option value="cassandra">Apache Cassandra</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Host / Server Address</label>
                <input
                  type="text"
                  required
                  value={host}
                  onChange={e => setHost(e.target.value)}
                  placeholder="e.g. localhost or db.company.internal"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Port & Database Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-300">Port</label>
                  <span className="text-[10px] text-slate-500 font-mono">Default: {DEFAULT_PORTS[dbType] || 5432}</span>
                </div>
                <input
                  type="number"
                  required
                  value={port}
                  onChange={e => setPort(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {dbType === 'cassandra' ? 'Keyspace / Database' : dbType === 'oracle' ? 'SID / Service Name' : 'Database Name'}
                </label>
                <input
                  type="text"
                  required
                  value={database}
                  onChange={e => setDatabase(e.target.value)}
                  placeholder="e.g. production_db"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Username & Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={dbType === 'postgresql' ? 'postgres' : 'root'}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 pr-10 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
                    title={showPassword ? 'Hide Password' : 'Show Password'}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Security: Enforce Read-Only Connection */}
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <label htmlFor="read-only-check" className="text-xs text-slate-300 flex items-center gap-2 cursor-pointer select-none">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-semibold text-slate-200">Enforce Read-Only Connection</div>
                  <div className="text-[11px] text-slate-400">Guarantees safety by preventing non-whitelisted mutation commands during audit.</div>
                </div>
              </label>
              <input
                type="checkbox"
                id="read-only-check"
                checked={readOnly}
                onChange={e => setReadOnly(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-sky-500 cursor-pointer"
              />
            </div>

            {/* Form Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Passwords are encrypted via AES-256 before storage.
              </span>
              <button
                type="submit"
                disabled={loading || !database.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Connecting &amp; Testing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Connect &amp; Save to Workspace</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
