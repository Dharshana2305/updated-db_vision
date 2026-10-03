import {
  User,
  Project,
  Review,
  Finding,
  RecommendationItem,
  AuditLog,
  DatabaseSchema,
  SQLAnalysisResult,
  QueryResult,
  ChatMessage,
  AppSettings,
  DatabaseConnectionConfig
} from './types.js';

const API_BASE = '/api';

function getAuthToken(): string | null {
  return localStorage.getItem('ai_db_reviewer_token');
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem('ai_db_reviewer_token', token);
  } else {
    localStorage.removeItem('ai_db_reviewer_token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    let errorMsg = `Error ${res.status}: ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.error) {
        errorMsg = typeof data.error === 'string' ? data.error : (data.error.message || errorMsg);
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Auth & OTP
  register: (name: string, email: string, password: string) =>
    request<{ success: boolean; user: User; requiresOtp?: boolean; message?: string; previewOtp?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    }),

  sendOtp: (email: string) =>
    request<{ success: boolean; message: string; previewOtp?: string }>('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),

  verifyOtp: (email: string, otp: string) =>
    request<{ success: boolean; user?: User; token?: string; message: string }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp })
    }),

  login: (email: string, password: string) =>
    request<{ success: boolean; user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),

  guestLogin: () =>
    request<{ success: boolean; user: User; token: string }>('/auth/guest', {
      method: 'POST'
    }),

  getMe: () => request<{ success: boolean; user: User }>('/auth/me'),

  // Projects
  getProjects: () => request<{ success: boolean; projects: Project[] }>('/projects'),
  getProject: (id: string) => request<{ success: boolean; project: Project }>(`/projects/${id}`),
  createProject: (data: { name: string; description?: string; databaseType?: string }) =>
    request<{ success: boolean; project: Project }>('/projects', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  deleteProject: (id: string) =>
    request<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' }),

  // Database Connection
  getSamples: () =>
    request<{ success: boolean; samples: Array<{ id: string; name: string; category: string; description: string; databaseType: string }> }>('/samples'),

  loadSample: (projectId: string, sampleId: string) =>
    request<{ success: boolean; message: string; testResult: any }>(`/projects/${projectId}/load-sample`, {
      method: 'POST',
      body: JSON.stringify({ sampleId })
    }),

  connectDatabase: (projectId: string, config: DatabaseConnectionConfig) =>
    request<{ success: boolean; testResult: any }>(`/projects/${projectId}/connection`, {
      method: 'POST',
      body: JSON.stringify(config)
    }),

  uploadDatabaseFile: async (
    projectId: string,
    file: File,
    onProgress?: (progress: { percent: number; currentMb: number; totalMb: number; chunkIndex: number; totalChunks: number }) => void
  ) => {
    // 8MB chunks to stay safely below Google Cloud Run 32MB HTTP request limit
    const CHUNK_SIZE = 8 * 1024 * 1024;
    const totalSize = file.size;
    const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
    const uploadId = `UP-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    let lastResult: any = null;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(totalSize, start + CHUNK_SIZE);
      const chunkBlob = file.slice(start, end);

      const formData = new FormData();
      formData.append('chunk', chunkBlob, file.name);
      formData.append('uploadId', uploadId);
      formData.append('chunkIndex', String(chunkIndex));
      formData.append('totalChunks', String(totalChunks));
      formData.append('filename', file.name);
      formData.append('totalSize', String(totalSize));

      const res = await request<{
        success: boolean;
        completed?: boolean;
        message?: string;
        testResult?: any;
        progress?: number;
      }>(`/projects/${projectId}/upload-chunk`, {
        method: 'POST',
        body: formData
      });

      lastResult = res;

      const currentBytes = Math.min(totalSize, (chunkIndex + 1) * CHUNK_SIZE);
      const percent = Math.min(100, Math.round(((chunkIndex + 1) / totalChunks) * 100));

      if (onProgress) {
        onProgress({
          percent,
          currentMb: parseFloat((currentBytes / (1024 * 1024)).toFixed(1)),
          totalMb: parseFloat((totalSize / (1024 * 1024)).toFixed(1)),
          chunkIndex: chunkIndex + 1,
          totalChunks
        });
      }
    }

    return lastResult || { success: true, message: 'Upload completed' };
  },

  getSchema: (projectId: string) =>
    request<{ success: boolean; schema: DatabaseSchema; capabilities: any }>(`/projects/${projectId}/schema`),

  // Review & Compare
  runReview: (projectId: string) =>
    request<{ success: boolean; review: Review; recommendations: RecommendationItem[] }>(`/projects/${projectId}/review/run`, {
      method: 'POST'
    }),

  getReviews: (projectId: string) =>
    request<{ success: boolean; reviews: Review[] }>(`/projects/${projectId}/reviews`),

  getReview: (projectId: string, reviewId: string) =>
    request<{ success: boolean; review: Review }>(`/projects/${projectId}/reviews/${reviewId}`),

  compareReviews: (projectId: string, r1?: string, r2?: string) =>
    request<any>(`/projects/${projectId}/compare?r1=${r1 || ''}&r2=${r2 || ''}`),

  // Findings
  getFindings: (projectId: string) =>
    request<{ success: boolean; findings: Finding[] }>(`/projects/${projectId}/findings`),

  updateFinding: (findingId: string, updates: { notes?: string; status?: string }) =>
    request<{ success: boolean; finding: Finding }>(`/findings/${findingId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    }),

  applyFindingFix: (findingId: string, projectId: string) =>
    request<{ success: boolean; message: string; finding: Finding; auditLog: AuditLog }>(`/findings/${findingId}/apply-fix`, {
      method: 'POST',
      body: JSON.stringify({ projectId })
    }),

  rollbackFindingFix: (findingId: string, projectId: string) =>
    request<{ success: boolean; message: string; finding: Finding }>(`/findings/${findingId}/rollback-fix`, {
      method: 'POST',
      body: JSON.stringify({ projectId })
    }),

  // Data Quality Profiler
  profileTable: (projectId: string, tableName?: string, maxRows = 500) =>
    request<{ success: boolean; message: string; tableProfiles: Record<string, any>; schema: DatabaseSchema }>(`/projects/${projectId}/profile`, {
      method: 'POST',
      body: JSON.stringify({ tableName, maxRows })
    }),

  // Recommendations & Approvals
  getRecommendations: (projectId: string) =>
    request<{ success: boolean; recommendations: RecommendationItem[] }>(`/projects/${projectId}/recommendations`),

  approveRecommendation: (recId: string, projectId: string) =>
    request<{ success: boolean; recommendation: RecommendationItem; auditLog: AuditLog }>(`/recommendations/${recId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ projectId })
    }),

  approveAllRecommendations: (projectId: string) =>
    request<{ success: boolean; message: string; count: number; recommendations: RecommendationItem[] }>(`/projects/${projectId}/recommendations/approve-all`, {
      method: 'POST'
    }),

  fixAllFindingsAndFlaws: (projectId: string) =>
    request<{
      success: boolean;
      message: string;
      appliedCount: number;
      failedCount: number;
      review?: Review;
      recommendations?: RecommendationItem[];
      auditLog?: AuditLog;
    }>(`/projects/${projectId}/fix-all`, {
      method: 'POST'
    }),

  downloadUpdatedDatabaseFile: async (projectId: string, format: 'sqlite' | 'sql' = 'sqlite', customFilename?: string): Promise<void> => {
    const token = getAuthToken();
    const res = await fetch(`/api/projects/${projectId}/export?format=${format}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: 'Export failed' } }));
      throw new Error(err?.error?.message || `Export failed with status ${res.status}`);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const contentDisposition = res.headers.get('content-disposition');
    let downloadName = customFilename;
    if (!downloadName && contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";]+)"?/i);
      if (match) downloadName = match[1];
    }
    a.download = downloadName || `hardened_database.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  rejectRecommendation: (recId: string, projectId: string, reason?: string) =>
    request<{ success: boolean; recommendation: RecommendationItem }>(`/recommendations/${recId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ projectId, reason })
    }),

  rollbackRecommendation: (recId: string, projectId: string) =>
    request<{ success: boolean; recommendation: RecommendationItem }>(`/recommendations/${recId}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ projectId })
    }),

  // Audit Logs - Segregated by Database & Workspace
  getAuditLogs: (projectId: string, databaseKey?: string) =>
    request<{
      success: boolean;
      auditLogs: AuditLog[];
      databaseKey: string;
      activeDatabaseKey: string;
      availableDatabases: { key: string; name: string; logCount: number; isActive: boolean }[];
    }>(`/projects/${projectId}/audit-logs${databaseKey ? `?databaseKey=${encodeURIComponent(databaseKey)}` : ''}`),

  // SQL Analyzer
  analyzeSql: (projectId: string, sql: string) =>
    request<{ success: boolean; analysis: SQLAnalysisResult }>(`/projects/${projectId}/sql/analyze`, {
      method: 'POST',
      body: JSON.stringify({ sql })
    }),

  executeSql: (projectId: string, sql: string, maxRows = 100) =>
    request<{ success: boolean; result: QueryResult }>(`/projects/${projectId}/sql/execute`, {
      method: 'POST',
      body: JSON.stringify({ sql, maxRows })
    }),

  benchmarkSql: (projectId: string, sql: string, optimizedSql?: string) =>
    request<{ success: boolean; original: any; optimized?: any; improvementPct: number }>(`/projects/${projectId}/sql/benchmark`, {
      method: 'POST',
      body: JSON.stringify({ sql, optimizedSql })
    }),

  // Chat & Explain (Database & Workspace scoped)
  getChatHistory: (projectId: string, databaseKey?: string) =>
    request<{
      success: boolean;
      messages: ChatMessage[];
      databaseKey: string;
      activeDatabaseKey: string;
      availableDatabases: { key: string; name: string; messageCount: number; isActive: boolean }[];
    }>(`/projects/${projectId}/chat${databaseKey ? `?databaseKey=${encodeURIComponent(databaseKey)}` : ''}`),

  sendChatMessage: (projectId: string, message: string, databaseKey?: string) =>
    request<{
      success: boolean;
      message: ChatMessage;
      databaseKey: string;
      availableDatabases: { key: string; name: string; messageCount: number; isActive: boolean }[];
    }>(`/projects/${projectId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, databaseKey })
    }),

  clearChatHistory: (projectId: string, databaseKey?: string) =>
    request<{ success: boolean; message: string; databaseKey: string }>(
      `/projects/${projectId}/chat${databaseKey ? `?databaseKey=${encodeURIComponent(databaseKey)}` : ''}`,
      { method: 'DELETE' }
    ),

  explainDatabase: (projectId: string) =>
    request<{ success: boolean; explanation: string; provider: string }>(`/projects/${projectId}/explain`, {
      method: 'POST'
    }),

  triggerReview: (projectId: string) =>
    request<{ success: boolean; review: Review; recommendations: RecommendationItem[] }>(`/projects/${projectId}/review/run`, {
      method: 'POST'
    }),

  exportReport: (reviewId: string, format: string) =>
    request<{ content: string; filename: string; contentType: string }>(`/reports/${reviewId}/export?format=${format}`),

  // Downloads
  getDatabaseDownloadUrl: (projectId: string) => `/api/projects/${projectId}/download-db`,
  getMigrationDownloadUrl: (projectId: string) => `/api/projects/${projectId}/download-migration`,

  // Settings
  getSettings: () => request<{ success: boolean; settings: AppSettings }>('/settings'),
  updateSettings: (updates: Partial<AppSettings>) =>
    request<{ success: boolean; settings: AppSettings }>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(updates)
    }),
  testOllama: (baseUrl?: string) =>
    request<{ health: any; success?: boolean; message?: string }>('/settings/test-ollama', {
      method: 'POST',
      body: JSON.stringify({ baseUrl })
    }),
  getSystemInfo: () => request<any>('/settings/system-info'),
  getDiagnostics: () => request<any>('/settings/system-info')
};
