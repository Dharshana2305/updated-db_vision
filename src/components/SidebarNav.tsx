import React from 'react';
import {
  LayoutDashboard,
  Database,
  Search,
  Activity,
  AlertTriangle,
  GitGraph,
  CheckCircle,
  Terminal,
  MessageSquare,
  ShieldCheck,
  GitCompare,
  FileText,
  Settings,
  FolderKanban
} from 'lucide-react';
import { useProject } from '../context/ProjectContext.js';

interface SidebarNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({ activeTab, onTabChange }) => {
  const { latestReview, recommendations } = useProject();

  const totalFindings = latestReview?.findings.length || 0;
  const criticalFindings = latestReview?.findings.filter(f => f.severity === 'CRITICAL').length || 0;
  const pendingRecs = recommendations.filter(r => r.status === 'PENDING').length;

  const navSections = [
    {
      group: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'projects', label: 'Workspaces', icon: FolderKanban },
        { id: 'connection', label: 'Database Connect', icon: Database }
      ]
    },
    {
      group: 'Analysis & Architecture',
      items: [
        { id: 'review', label: 'Audit & Review', icon: Search },
        {
          id: 'health',
          label: 'Health Score',
          icon: Activity,
          badge: latestReview ? `${latestReview.healthScore.overall}/100` : undefined,
          badgeColor: 'bg-sky-500/20 text-sky-400'
        },
        {
          id: 'findings',
          label: 'Findings & Flaws',
          icon: AlertTriangle,
          badge: totalFindings > 0 ? String(totalFindings) : undefined,
          badgeColor: criticalFindings > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'
        },
        { id: 'erdiagram', label: 'Interactive ERD', icon: GitGraph },
        { id: 'quality', label: 'Data Quality Profiler', icon: CheckCircle }
      ]
    },
    {
      group: 'Optimization & AI',
      items: [
        { id: 'sql', label: 'SQL Optimizer', icon: Terminal },
        { id: 'chat', label: 'AI Database Copilot', icon: MessageSquare },
        {
          id: 'recommendations',
          label: 'Approval Center',
          icon: ShieldCheck,
          badge: pendingRecs > 0 ? `${pendingRecs} Pending` : undefined,
          badgeColor: 'bg-amber-500/20 text-amber-400'
        }
      ]
    },
    {
      group: 'Deliverables & System',
      items: [
        { id: 'history', label: 'Review Version Diff', icon: GitCompare },
        { id: 'reports', label: 'Executive Reports', icon: FileText },
        { id: 'settings', label: 'Settings & Ollama', icon: Settings }
      ]
    }
  ];

  return (
    <aside className="w-64 bg-slate-950/70 border-r border-slate-800/80 flex flex-col justify-between p-3 shrink-0 select-none">
      <div className="space-y-6 overflow-y-auto pr-1">
        {navSections.map(sec => (
          <div key={sec.group}>
            <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {sec.group}
            </div>
            <div className="space-y-1">
              {sec.items.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-${item.id}`}
                    onClick={() => onTabChange(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-500'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full font-mono ${item.badgeColor}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-slate-800/80 px-2 text-[11px] text-slate-500">
        <div className="flex items-center justify-between">
          <span>AI Database Reviewer</span>
          <span className="font-mono text-[10px]">v1.0</span>
        </div>
        <div className="text-[10px] text-slate-600 mt-0.5">MCA Capstone 2026</div>
      </div>
    </aside>
  );
};
