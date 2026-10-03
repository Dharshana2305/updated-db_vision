import React, { useState, useEffect } from 'react';
import {
  Settings,
  Cpu,
  Shield,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Server,
  Zap,
  HardDrive
} from 'lucide-react';
import { api } from '../api.js';
import { SystemSettings } from '../types.js';

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingOllama, setTestingOllama] = useState(false);
  const [ollamaTestResult, setOllamaTestResult] = useState<any | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    loadSettings();
    loadDiagnostics();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await api.getSettings();
      setSettings(res.settings);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const loadDiagnostics = async () => {
    try {
      const res = await api.getDiagnostics();
      setDiagnostics(res.diagnostics);
    } catch (err) {
      console.error('Failed to load diagnostics:', err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSavedSuccess(false);
    try {
      const res = await api.updateSettings(settings);
      setSettings(res.settings);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestOllama = async () => {
    setTestingOllama(true);
    setOllamaTestResult(null);
    try {
      const res = await api.testOllama();
      setOllamaTestResult(res);
    } catch (err: any) {
      setOllamaTestResult({ success: false, message: err.message });
    } finally {
      setTestingOllama(false);
    }
  };

  if (!settings) {
    return <div className="p-8 text-center text-slate-500 text-xs">Loading configuration...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">AI &amp; System Configuration</h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure local Ollama LLM endpoints, privacy PII sanitization, and inspect memory diagnostics.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>Settings saved successfully.</span>
        </div>
      )}

      {/* AI Engine Settings */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 border-b border-slate-800 pb-3">
            <Cpu className="w-4 h-4 text-sky-400" />
            <span>Local AI Model (Ollama)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Ollama Base URL</label>
              <input
                type="text"
                value={settings.ollamaBaseUrl}
                onChange={e => setSettings({ ...settings, ollamaBaseUrl: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-sky-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Default: http://localhost:11434</span>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Model Name</label>
              <input
                type="text"
                value={settings.ollamaModel}
                onChange={e => setSettings({ ...settings, ollamaModel: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-sky-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Lightweight 3B: llama3.2:3b, phi3, mistral</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Response Timeout (Seconds)</label>
              <input
                type="number"
                value={settings.timeoutSeconds}
                onChange={e => setSettings({ ...settings, timeoutSeconds: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono focus:outline-none focus:border-sky-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Optimized for 8GB RAM host machines</span>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Autonomous Fallback Strategy</label>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 font-mono text-[11px]">
                Deterministic Rule Engine (Always Guaranteed)
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={handleTestOllama}
              disabled={testingOllama}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${testingOllama ? 'animate-spin' : ''}`} />
              <span>{testingOllama ? 'Testing Ollama...' : 'Test Ollama Connection'}</span>
            </button>

            {ollamaTestResult && (
              <span
                className={`text-xs font-medium ${
                  ollamaTestResult.success ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {ollamaTestResult.message}
              </span>
            )}
          </div>
        </div>

        {/* Privacy & Security */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 border-b border-slate-800 pb-3">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Privacy &amp; PII Data Masking</span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-200">Strict PII Masking Engine</div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Automatically masks email addresses, credit cards, SSNs, and phone numbers before analysis.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.enablePiiMasking}
              onChange={e => setSettings({ ...settings, enablePiiMasking: e.target.checked })}
              className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-sky-500"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div>
              <div className="text-xs font-semibold text-slate-200">Safe Rule-Based Fallback Mode</div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                If the local Ollama instance is unresponsive, automatically switch to AST deterministic rule sets without user disruption.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.fallbackToRules}
              onChange={e => setSettings({ ...settings, fallbackToRules: e.target.checked })}
              className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-sky-500"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors shadow-lg disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </form>

      {/* System Diagnostics & Memory Monitoring */}
      {diagnostics && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 border-b border-slate-800 pb-3">
            <Server className="w-4 h-4 text-amber-400" />
            <span>Host System Diagnostics</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase">Node Environment</span>
              <span className="font-bold text-slate-200 mt-1 block">{diagnostics.nodeVersion}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase">RAM Allocation (RSS)</span>
              <span className="font-bold text-sky-400 mt-1 block">{diagnostics.memoryUsage?.rssMb} MB</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase">Heap Used</span>
              <span className="font-bold text-emerald-400 mt-1 block">{diagnostics.memoryUsage?.heapUsedMb} MB</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase">Process Uptime</span>
              <span className="font-bold text-slate-300 mt-1 block">{Math.round(diagnostics.uptimeSeconds / 60)} mins</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
