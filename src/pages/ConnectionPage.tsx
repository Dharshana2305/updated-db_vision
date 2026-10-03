import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Upload,
  Sparkles,
  Server,
  CheckCircle2,
  AlertCircle,
  Play,
  FileCode,
  Shield,
  Layers,
  ArrowRight
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';
import { api } from '../api.js';
import { DatabaseConnectionConfig, DatabaseType } from '../types.js';

interface ConnectionPageProps {
  onNavigateToTab: (tab: string) => void;
}

export const ConnectionPage: React.FC<ConnectionPageProps> = ({ onNavigateToTab }) => {
  const { activeProject, refreshProjects, refreshSchema, refreshReviewData } = useProject();
  const [activeTab, setActiveTab] = useState<'samples' | 'upload' | 'credentials'>('samples');
  const [samples, setSamples] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    percent: number;
    currentMb: number;
    totalMb: number;
    chunkIndex: number;
    totalChunks: number;
  } | null>(null);

  // Form for credentials
  const [dbType, setDbType] = useState<DatabaseType>('postgresql');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState(5432);
  const [database, setDatabase] = useState('production_db');
  const [username, setUsername] = useState('postgres');
  const [password, setPassword] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.getSamples().then(res => setSamples(res.samples)).catch(console.error);
  }, []);

  const handleLoadSample = async (sampleId: string) => {
    if (!activeProject) return;
    setLoading(true);
    setStatusMessage(null);

    try {
      const res = await api.loadSample(activeProject.id, sampleId);
      setStatusMessage({ type: 'success', text: res.message });
      await refreshProjects();
      await refreshSchema();
      await refreshReviewData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to load sample database' });
    } finally {
      setLoading(false);
    }
  };

  const processUploadFile = async (file: File) => {
    if (!file || !activeProject) return;

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
        text: `${res.message} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`
      });
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
    if (file) processUploadFile(file);
  };

  const handleConnectCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    setLoading(true);
    setStatusMessage(null);

    try {
      const config: DatabaseConnectionConfig = {
        type: dbType,
        host,
        port: Number(port),
        database,
        username,
        password,
        readOnly
      };

      const res = await api.connectDatabase(activeProject.id, config);
      if (res.success) {
        setStatusMessage({ type: 'success', text: `Successfully connected to ${dbType.toUpperCase()} server!` });
        await refreshProjects();
        await refreshSchema();
      } else {
        setStatusMessage({ type: 'error', text: res.testResult?.message || 'Connection test failed' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Connection error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Database Connection Hub</h1>
        <p className="text-xs text-slate-400 mt-1">
          Connect local database files, pre-seeded production benchmarks, or live database servers.
        </p>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span className="font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab('samples')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'samples'
              ? 'border-sky-400 text-sky-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Prepackaged Realistic Samples (Recommended)
        </button>

        <button
          onClick={() => setActiveTab('upload')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'upload'
              ? 'border-sky-400 text-sky-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Upload className="w-4 h-4" />
          Upload .sql / .sqlite File
        </button>

        <button
          onClick={() => setActiveTab('credentials')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'credentials'
              ? 'border-sky-400 text-sky-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Server className="w-4 h-4" />
          Direct Server Connection (Multi-DB)
        </button>
      </div>

      {/* Tab 1: Prepackaged Samples */}
      {activeTab === 'samples' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-sky-950/30 border border-sky-800/30 text-xs text-sky-300">
            <strong>Ideal for College Viva Demonstrations: </strong>
            These real-world databases are loaded instantly inside the WebAssembly SQL engine. They contain authentic real-world architectural challenges: plaintext passwords, PCI-DSS card violations, missing foreign key indexes, and unnormalized tables.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {samples.map(sample => {
              const isCurrent = activeProject?.connectionConfig?.sampleId === sample.id;
              return (
                <div
                  key={sample.id}
                  className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between transition-all ${
                    isCurrent ? 'border-sky-400 shadow-lg shadow-sky-500/10' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 uppercase font-mono">
                        {sample.category}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          LOADED
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-100 text-sm">{sample.name}</h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{sample.description}</p>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-800">
                    <button
                      id={`btn-load-sample-${sample.id}`}
                      onClick={() => handleLoadSample(sample.id)}
                      disabled={loading}
                      className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-sky-600 hover:text-white text-xs font-semibold text-slate-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{isCurrent ? 'Reload Sample' : 'Load into Workspace'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Upload File */}
      {activeTab === 'upload' && (
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
            if (file) processUploadFile(file);
          }}
          className={`border-2 border-dashed rounded-2xl p-8 text-center max-w-xl mx-auto space-y-4 transition-all ${
            isDragging
              ? 'bg-sky-500/10 border-sky-400 scale-[1.01]'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center mx-auto">
            <FileCode className="w-8 h-8" />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-mono font-semibold uppercase mb-2">
              Supports up to 150MB
            </div>
            <h3 className="text-base font-bold text-slate-100">Upload DDL Script or SQLite File</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Drag and drop any standard SQL schema file (<code>.sql</code>) or SQLite database binary (<code>.sqlite</code>, <code>.db</code>, <code>.sqlite3</code>). Up to 150MB supported.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".sql,.sqlite,.db,.sqlite3"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-lg transition-colors inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>{loading ? 'Uploading & Profiling...' : 'Select Database File'}</span>
            </button>
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

          <p className="text-[11px] text-slate-500">
            Files up to 150MB are processed locally in an isolated sandbox. Zero external data exposure.
          </p>
        </div>
      )}

      {/* Tab 3: Credentials / Server */}
      {activeTab === 'credentials' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl mx-auto">
          <form onSubmit={handleConnectCredentials} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Database Engine</label>
                <select
                  value={dbType}
                  onChange={e => setDbType(e.target.value as DatabaseType)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="sqlserver">Microsoft SQL Server</option>
                  <option value="oracle">Oracle Database</option>
                  <option value="mongodb">MongoDB</option>
                  <option value="redis">Redis</option>
                  <option value="cassandra">Apache Cassandra</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Host / Address</label>
                <input
                  type="text"
                  required
                  value={host}
                  onChange={e => setHost(e.target.value)}
                  placeholder="localhost"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Port</label>
                <input
                  type="number"
                  required
                  value={port}
                  onChange={e => setPort(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Database Name</label>
                <input
                  type="text"
                  required
                  value={database}
                  onChange={e => setDatabase(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="read-only-check"
                checked={readOnly}
                onChange={e => setReadOnly(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-sky-500"
              />
              <label htmlFor="read-only-check" className="text-xs text-slate-300 flex items-center gap-1.5 cursor-pointer">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                Enforce Read-Only Connection (Prevents accidental write operations)
              </label>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? 'Testing Connection...' : 'Test & Connect Server'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
