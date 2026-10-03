import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Project, DatabaseSchema, Review, RecommendationItem } from '../types.js';
import { api } from '../api.js';
import { useAuth } from './AuthContext.js';

interface ProjectContextType {
  projects: Project[];
  activeProject: Project | null;
  schema: DatabaseSchema | null;
  latestReview: Review | null;
  recommendations: RecommendationItem[];
  loadingProjects: boolean;
  refreshProjects: () => Promise<void>;
  selectProject: (p: Project) => void;
  switchProject: (id: string) => void;
  createProject: (data: { name: string; description?: string; databaseType: any }) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  refreshSchema: () => Promise<void>;
  refreshReviewData: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [schema, setSchema] = useState<DatabaseSchema | null>(null);
  const [latestReview, setLatestReview] = useState<Review | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const refreshProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setActiveProject(null);
      return;
    }
    setLoadingProjects(true);
    try {
      const res = await api.getProjects();
      setProjects(res.projects);

      // Restore active project or pick first
      const savedProjectId = localStorage.getItem('ai_db_reviewer_active_proj');
      const found = res.projects.find(p => p.id === savedProjectId);

      if (found) {
        setActiveProject(found);
      } else if (res.projects.length > 0) {
        setActiveProject(res.projects[0]);
        localStorage.setItem('ai_db_reviewer_active_proj', res.projects[0].id);
      } else {
        setActiveProject(null);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  }, [user]);

  const refreshSchema = useCallback(async () => {
    if (!activeProject) {
      setSchema(null);
      return;
    }
    try {
      const res = await api.getSchema(activeProject.id);
      setSchema(res.schema);
    } catch {
      setSchema(null);
    }
  }, [activeProject]);

  const refreshReviewData = useCallback(async () => {
    if (!activeProject) {
      setLatestReview(null);
      setRecommendations([]);
      return;
    }
    try {
      const revRes = await api.getReviews(activeProject.id);
      if (revRes.reviews && revRes.reviews.length > 0) {
        setLatestReview(revRes.reviews[0]);
      } else {
        setLatestReview(null);
      }

      const recRes = await api.getRecommendations(activeProject.id);
      setRecommendations(recRes.recommendations || []);
    } catch (err) {
      console.error('Failed to refresh review data:', err);
    }
  }, [activeProject]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (activeProject) {
      refreshSchema();
      refreshReviewData();
    }
  }, [activeProject, refreshSchema, refreshReviewData]);

  const selectProject = (p: Project) => {
    setActiveProject(p);
    localStorage.setItem('ai_db_reviewer_active_proj', p.id);
  };

  const switchProject = (id: string) => {
    const found = projects.find(p => p.id === id);
    if (found) selectProject(found);
  };

  const createProject = async (data: { name: string; description?: string; databaseType: any }) => {
    const res = await api.createProject(data);
    await refreshProjects();
    selectProject(res.project);
    return res.project;
  };

  const deleteProject = async (id: string) => {
    await api.deleteProject(id);
    await refreshProjects();
  };

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        schema,
        latestReview,
        recommendations,
        loadingProjects,
        refreshProjects,
        selectProject,
        switchProject,
        createProject,
        deleteProject,
        refreshSchema,
        refreshReviewData
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
};
