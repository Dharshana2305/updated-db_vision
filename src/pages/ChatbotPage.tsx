import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Sparkles,
  Bot,
  User as UserIcon,
  Play,
  CheckCircle2,
  Terminal,
  HelpCircle,
  BarChart3,
  Cpu,
  Trash2,
  Database,
  Layers,
  Shield,
  ShieldAlert,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useProject } from '../context/ProjectContext.js';
import { api } from '../api.js';
import { ChatMessage, QueryResult } from '../types.js';
import { ChartVisualizer } from '../components/ChartVisualizer.js';

export const ChatbotPage: React.FC = () => {
  const { activeProject, schema, latestReview } = useProject();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedDbKey, setSelectedDbKey] = useState<string>('');
  const [availableDatabases, setAvailableDatabases] = useState<{ key: string; name: string; messageCount: number; isActive: boolean }[]>([]);
  const [queryResults, setQueryResults] = useState<Record<string, QueryResult>>({});
  const [executingSql, setExecutingSql] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch chat history for selected or active database
  const loadChat = (dbKey?: string) => {
    if (!activeProject) return;
    api.getChatHistory(activeProject.id, dbKey)
      .then(res => {
        setMessages(res.messages || []);
        setSelectedDbKey(res.databaseKey);
        setAvailableDatabases(res.availableDatabases || []);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadChat(selectedDbKey || undefined);
  }, [activeProject, selectedDbKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || !activeProject || loading) return;

    setInput('');
    setLoading(true);

    const optimisticMsg: ChatMessage = {
      id: `OPT-${Date.now()}`,
      role: 'user',
      content: query.trim(),
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const res = await api.sendChatMessage(activeProject.id, query.trim(), selectedDbKey);
      setMessages(prev => [...prev, res.message]);
      if (res.availableDatabases) {
        setAvailableDatabases(res.availableDatabases);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `ERR-${Date.now()}`,
        role: 'assistant',
        content: `### ⚠️ Notice\n\nUnable to complete AI query: ${err.message || 'Service temporarily unavailable'}. Please verify your connection or try again.`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!activeProject || clearing) return;
    setClearing(true);
    try {
      await api.clearChatHistory(activeProject.id, selectedDbKey);
      setMessages([]);
      loadChat(selectedDbKey);
    } catch (err: any) {
      console.error('Failed to clear chat:', err);
    } finally {
      setClearing(false);
    }
  };

  const handleApproveAndExecuteSql = async (msgId: string, sql: string) => {
    if (!activeProject) return;
    setExecutingSql(msgId);
    try {
      const res = await api.executeSql(activeProject.id, sql);
      setQueryResults(prev => ({ ...prev, [msgId]: res.result }));
    } catch (err: any) {
      alert(`Query failed: ${err.message}`);
    } finally {
      setExecutingSql(null);
    }
  };

  const activeDbName =
    schema?.databaseName ||
    activeProject?.connectionConfig?.name ||
    activeProject?.databaseType ||
    'Active Database';

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-slate-950 max-w-5xl mx-auto p-4 select-text">
      {/* Header */}
      <div className="border-b border-slate-800 pb-3 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                AI Database Copilot
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-400">
                Workspace: {activeProject?.name || 'Workspace'}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Strict Dataset Limits
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span>Chat history maintained separately for:</span>
              <strong className="text-slate-200 font-mono font-medium">{activeDbName}</strong>
            </p>
          </div>
        </div>

        {/* Database Switcher & Actions */}
        <div className="flex items-center gap-2">
          {availableDatabases.length > 1 && (
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2 py-1 rounded-xl text-xs">
              <Database className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedDbKey}
                onChange={e => setSelectedDbKey(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
                title="Select database chat history"
              >
                {availableDatabases.map(db => (
                  <option key={db.key} value={db.key} className="bg-slate-900 text-slate-200">
                    {db.name} ({db.messageCount} msgs){db.isActive ? ' [Active]' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {messages.length > 0 && (
            <button
              onClick={handleClearHistory}
              disabled={clearing}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/30 text-xs transition-colors flex items-center gap-1"
              title="Clear chat history for this database"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Dataset Boundary Enforcement Banner */}
      <div className="mb-3 px-3 py-2 rounded-xl bg-sky-950/30 border border-sky-800/30 text-sky-300 text-[11px] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>
            <strong>Dataset Boundary Active:</strong> The AI only answers questions based on tables in <code className="text-sky-200 bg-sky-900/40 px-1 py-0.5 rounded font-mono font-semibold">{activeDbName}</code>. Questions outside this dataset will be declined.
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono hidden md:inline shrink-0">
          Separate per Database &amp; Workspace
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.length === 0 ? (
          <div className="p-8 text-center space-y-5 max-w-xl mx-auto mt-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center mx-auto">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-200">
                AI Database Copilot &bull; {activeDbName}
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                This conversation thread is isolated exclusively to <strong>{activeDbName}</strong> in <strong>{activeProject?.name}</strong>. It enforces strict dataset grounding and will decline questions outside this database.
              </p>
            </div>

            {/* Quick Prompts Grid */}
            <div className="space-y-2 text-left pt-2">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Dataset-Grounded Questions:</span>
                <span className="text-emerald-400 text-[10px] font-mono">Answers from schema</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => handleSend('How many tables in the dataset?')}
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs border border-slate-800 transition-colors text-left"
                >
                  &ldquo;How many tables in the dataset?&rdquo;
                </button>
                <button
                  onClick={() => handleSend('Explain my database architecture')}
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs border border-slate-800 transition-colors text-left"
                >
                  &ldquo;Explain my database architecture&rdquo;
                </button>
                <button
                  onClick={() => handleSend('Show all foreign key relationships')}
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs border border-slate-800 transition-colors text-left"
                >
                  &ldquo;Show all foreign key relationships&rdquo;
                </button>
                <button
                  onClick={() => handleSend('Why is my health score low?')}
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs border border-slate-800 transition-colors text-left"
                >
                  &ldquo;Why is my health score low?&rdquo;
                </button>
              </div>

              {/* Test Dataset Boundaries Button */}
              <div className="pt-2">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between mb-1.5">
                  <span>Test AI Dataset Limits (Refusal Check):</span>
                  <span className="text-amber-400 text-[10px] font-mono">Declines out-of-scope</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => handleSend('What is the capital of France?')}
                    className="p-2.5 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 text-amber-300/90 text-xs border border-amber-500/20 transition-colors text-left flex items-center justify-between"
                  >
                    <span>&ldquo;What is the capital of France?&rdquo;</span>
                    <span className="text-[10px] font-mono text-amber-400 shrink-0">General trivia &rarr;</span>
                  </button>
                  <button
                    onClick={() => handleSend('Show me all flight airline bookings')}
                    className="p-2.5 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 text-amber-300/90 text-xs border border-amber-500/20 transition-colors text-left flex items-center justify-between"
                  >
                    <span>&ldquo;Show all flight airline bookings&rdquo;</span>
                    <span className="text-[10px] font-mono text-amber-400 shrink-0">Foreign entity &rarr;</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-3 text-xs leading-relaxed ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-sky-600/20 border border-sky-500/40 text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl p-4 space-y-3 ${
                  msg.role === 'user'
                    ? 'bg-sky-600 text-white rounded-br-sm'
                    : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-sm'
                }`}
              >
                <div className="prose prose-invert prose-xs max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>

                {/* If AI generated SQL */}
                {msg.sqlGenerated && (
                  <div className="mt-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-sky-400 flex items-center gap-1.5 font-mono">
                        <Terminal className="w-3.5 h-3.5" />
                        Generated Read-Only SQL
                      </span>
                      <span className="text-[10px] text-amber-400 font-medium">User Approval Required</span>
                    </div>

                    <pre className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-sky-300 font-mono text-[11px] overflow-x-auto">
                      {msg.sqlGenerated.query}
                    </pre>

                    <p className="text-[11px] text-slate-400">{msg.sqlGenerated.explanation}</p>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => handleApproveAndExecuteSql(msg.id, msg.sqlGenerated!.query)}
                        disabled={executingSql === msg.id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                      >
                        <Play className="w-3 h-3" />
                        <span>{executingSql === msg.id ? 'Running Query...' : 'Approve & Execute Live Query'}</span>
                      </button>
                    </div>

                    {/* Render live results and interactive charts if query was executed */}
                    {queryResults[msg.id] && (
                      <div className="mt-4 pt-3 border-t border-slate-800">
                        <ChartVisualizer queryResult={queryResults[msg.id]} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex gap-3 text-xs justify-start">
            <div className="w-7 h-7 rounded-lg bg-sky-600/20 border border-sky-500/40 text-sky-400 flex items-center justify-center shrink-0 animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 rounded-bl-sm flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
              <span>Checking dataset boundaries and analyzing schema document...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="pt-3 border-t border-slate-800 shrink-0">
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Ask about ${activeDbName} (queries outside this dataset will be declined)...`}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500 placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white transition-colors"
            title="Send Message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
