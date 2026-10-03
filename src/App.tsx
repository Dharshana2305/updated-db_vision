import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ProjectProvider, useProject } from './context/ProjectContext.js';
import { Navbar } from './components/Navbar.js';
import { SidebarNav } from './components/SidebarNav.js';
import { AuthPage } from './pages/AuthPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { ConnectionPage } from './pages/ConnectionPage.js';
import { ReviewPage } from './pages/ReviewPage.js';
import { HealthScorePage } from './pages/HealthScorePage.js';
import { FindingsPage } from './pages/FindingsPage.js';
import { ERDiagramPage } from './pages/ERDiagramPage.js';
import { DataQualityPage } from './pages/DataQualityPage.js';
import { SqlAnalyzerPage } from './pages/SqlAnalyzerPage.js';
import { ChatbotPage } from './pages/ChatbotPage.js';
import { RecommendationsPage } from './pages/RecommendationsPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { HistoryComparePage } from './pages/HistoryComparePage.js';
import { ProjectsPage } from './pages/ProjectsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { api } from './api.js';

const MainAppLayout: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { activeProject, refreshReviewData, refreshSchema } = useProject();

  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [reviewBanner, setReviewBanner] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-sky-400 font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
          <span>Initializing AI Database Reviewer Workspace...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const handleTriggerReview = async () => {
    if (!activeProject || reviewing) return;
    setReviewing(true);
    setReviewBanner(null);
    try {
      const res = await api.triggerReview(activeProject.id);
      await refreshReviewData();
      await refreshSchema();
      setReviewBanner({
        type: 'success',
        message: `Review completed! Generated health score: ${res.review.healthScore.overall}/100 (${res.review.findings.length} findings).`
      });
      setTimeout(() => setReviewBanner(null), 6000);
    } catch (err: any) {
      setReviewBanner({
        type: 'error',
        message: err.message || 'Review execution failed.'
      });
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      {/* Top Navigation Bar */}
      <Navbar
        onOpenNewProjectModal={() => setCurrentTab('projects')}
        onNavigateToTab={tab => setCurrentTab(tab)}
      />

      {/* Review Feedback Toast / Banner */}
      {reviewBanner && (
        <div
          className={`px-4 py-2.5 text-xs flex items-center justify-between z-30 transition-all ${
            reviewBanner.type === 'success'
              ? 'bg-emerald-500/20 border-b border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/20 border-b border-rose-500/30 text-rose-300'
          }`}
        >
          <span className="font-medium">{reviewBanner.message}</span>
          <button
            onClick={() => setReviewBanner(null)}
            className="text-[11px] underline hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Collapsible Sidebar */}
        <SidebarNav
          activeTab={currentTab}
          onTabChange={tab => setCurrentTab(tab)}
        />

        {/* Tab Content Router */}
        <main className="flex-1 overflow-y-auto bg-slate-950/80">
          {currentTab === 'dashboard' && (
            <DashboardPage
              onNavigateToTab={setCurrentTab}
              onTriggerReview={handleTriggerReview}
              reviewing={reviewing}
            />
          )}

          {currentTab === 'projects' && (
            <ProjectsPage onNavigateToTab={setCurrentTab} />
          )}

          {currentTab === 'connection' && (
            <ConnectionPage onNavigateToTab={setCurrentTab} />
          )}

          {currentTab === 'review' && (
            <ReviewPage
              onNavigateToTab={setCurrentTab}
              onTriggerReview={handleTriggerReview}
              reviewing={reviewing}
            />
          )}

          {currentTab === 'health' && (
            <HealthScorePage onNavigateToTab={setCurrentTab} />
          )}

          {currentTab === 'findings' && <FindingsPage />}

          {currentTab === 'erdiagram' && <ERDiagramPage />}

          {(currentTab === 'data-quality' || currentTab === 'quality') && <DataQualityPage />}

          {(currentTab === 'sql-analyzer' || currentTab === 'sql') && <SqlAnalyzerPage />}

          {currentTab === 'chat' && <ChatbotPage />}

          {currentTab === 'recommendations' && <RecommendationsPage />}

          {currentTab === 'history' && <HistoryComparePage />}

          {currentTab === 'reports' && <ReportsPage />}

          {currentTab === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <ProjectProvider>
        <MainAppLayout />
      </ProjectProvider>
    </AuthProvider>
  );
}
