import fs from 'fs';
import path from 'path';
import { User, Project, Review, Finding, RecommendationItem, AuditLog, ChatMessage, AppSettings } from '../../src/types.js';

interface DatabaseData {
  users: User[];
  userPasswords: Record<string, string>; // userId -> bcrypt hash
  projects: Project[];
  reviews: Review[];
  findings: Finding[];
  recommendations: RecommendationItem[];
  auditLogs: AuditLog[];
  chatMessages: Record<string, ChatMessage[]>; // projectId -> messages
  settings: AppSettings;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const defaultSettings: AppSettings = {
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:3b',
  geminiApiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
  maskPIIBeforeAI: true,
  maxProfileRows: Number(process.env.MAX_PROFILE_ROWS) || 500,
  theme: 'dark',
  activeAIProvider: process.env.GEMINI_API_KEY ? 'gemini' : 'ollama'
};

class Store {
  private data: DatabaseData = {
    users: [],
    userPasswords: {},
    projects: [],
    reviews: [],
    findings: [],
    recommendations: [],
    auditLogs: [],
    chatMessages: {},
    settings: defaultSettings
  };
  private isLoaded = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = {
          ...this.data,
          ...parsed,
          settings: { ...defaultSettings, ...(parsed.settings || {}) }
        };
      } else {
        this.save();
      }
      this.isLoaded = true;
    } catch (err) {
      console.warn('Could not read persistent DB file, starting with memory state:', err);
      this.isLoaded = true;
    }
  }

  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Failed to save to db.json:', err);
    }
  }

  // Users
  getUserByEmail(email: string): User | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  getUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  }

  getUserPasswordHash(userId: string): string | undefined {
    return this.data.userPasswords[userId];
  }

  createUser(user: User, passwordHash: string): User {
    this.data.users.push(user);
    this.data.userPasswords[user.id] = passwordHash;
    this.save();
    return user;
  }

  updateUser(id: string, updates: Partial<User>): User | undefined {
    const user = this.data.users.find(u => u.id === id);
    if (!user) return undefined;
    Object.assign(user, updates);
    this.save();
    return user;
  }

  // Projects
  getProjects(userId: string): Project[] {
    return this.data.projects.filter(p => p.userId === userId);
  }

  getProjectById(id: string, userId?: string): Project | undefined {
    return this.data.projects.find(p => p.id === id && (!userId || p.userId === userId));
  }

  createProject(project: Project): Project {
    this.data.projects.unshift(project);
    this.save();
    return project;
  }

  updateProject(id: string, updates: Partial<Project>): Project | undefined {
    const project = this.data.projects.find(p => p.id === id);
    if (!project) return undefined;
    Object.assign(project, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return project;
  }

  deleteProject(id: string, userId: string): boolean {
    const index = this.data.projects.findIndex(p => p.id === id && p.userId === userId);
    if (index === -1) return false;
    this.data.projects.splice(index, 1);
    this.data.reviews = this.data.reviews.filter(r => r.projectId !== id);
    this.data.findings = this.data.findings.filter(f => !f.id.startsWith(id));
    this.data.auditLogs = this.data.auditLogs.filter(a => a.projectId !== id);
    delete this.data.chatMessages[id];
    this.save();
    return true;
  }

  // Reviews
  getReviews(projectId: string): Review[] {
    return this.data.reviews.filter(r => r.projectId === projectId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getReviewById(id: string): Review | undefined {
    return this.data.reviews.find(r => r.id === id);
  }

  createReview(review: Review): Review {
    // Preserve any findings already applied in this project
    const existingRecs = this.getRecommendations(review.projectId);
    const appliedFindingIds = new Set(
      existingRecs.filter(r => r.status === 'APPLIED').map(r => r.findingId)
    );

    review.findings.forEach(f => {
      if (appliedFindingIds.has(f.id) || appliedFindingIds.has(`REC-${f.id}`)) {
        f.status = 'APPLIED';
      }
    });

    this.data.reviews.unshift(review);
    // Add findings
    this.data.findings = [
      ...review.findings,
      ...this.data.findings.filter(f => !review.findings.some(rf => rf.id === f.id))
    ];
    this.save();
    return review;
  }

  // Findings
  getFindings(projectId: string): Finding[] {
    // Return latest findings associated with this project's reviews
    const reviews = this.getReviews(projectId);
    if (reviews.length === 0) return [];
    const latestReview = reviews[0];
    return latestReview.findings;
  }

  updateFinding(findingId: string, updates: Partial<Finding>): Finding | undefined {
    let found: Finding | undefined;
    // Update in all matching reviews for this finding, so historical and current reviews stay synchronized
    for (const rev of this.data.reviews) {
      const idx = rev.findings.findIndex(f => f.id === findingId);
      if (idx !== -1) {
        rev.findings[idx] = { ...rev.findings[idx], ...updates };
        found = rev.findings[idx];
      }
    }
    const gIdx = this.data.findings.findIndex(f => f.id === findingId);
    if (gIdx !== -1) {
      this.data.findings[gIdx] = { ...this.data.findings[gIdx], ...updates };
      found = this.data.findings[gIdx];
    }
    if (found) this.save();
    return found;
  }

  // Recommendations
  getRecommendations(projectId: string): RecommendationItem[] {
    return this.data.recommendations.filter(r => r.projectId === projectId || r.id.startsWith(projectId) || r.findingId.startsWith(projectId));
  }

  saveRecommendations(projectId: string, recs: RecommendationItem[]): void {
    this.data.recommendations = [
      ...recs,
      ...this.data.recommendations.filter(r => !recs.some(nr => nr.id === r.id))
    ];
    this.save();
  }

  updateRecommendation(id: string, updates: Partial<RecommendationItem>): RecommendationItem | undefined {
    const rec = this.data.recommendations.find(r => r.id === id);
    if (!rec) return undefined;
    Object.assign(rec, updates);
    this.save();
    return rec;
  }

  // Audit Logs - Segregated by Workspace (projectId) and Database (databaseKey)
  getAuditLogs(projectId: string, databaseKey?: string): AuditLog[] {
    const targetKey = databaseKey && databaseKey !== 'all' ? this.getDatabaseKey(projectId, databaseKey) : null;
    return this.data.auditLogs
      .filter(a => {
        if (a.projectId !== projectId) return false;
        if (targetKey) {
          const aKey = a.databaseKey ? this.getDatabaseKey(projectId, a.databaseKey) : null;
          return aKey === targetKey;
        }
        return true;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  addAuditLog(log: AuditLog): void {
    if (!log.databaseKey) {
      log.databaseKey = this.getDatabaseKey(log.projectId);
    } else {
      log.databaseKey = this.getDatabaseKey(log.projectId, log.databaseKey);
    }
    if (!log.databaseName) {
      log.databaseName = this.formatDbKeyName(log.databaseKey);
    }
    this.data.auditLogs.unshift(log);
    this.save();
  }

  getAuditDatabases(projectId: string): { key: string; name: string; logCount: number; isActive: boolean }[] {
    const activeDbKey = this.getDatabaseKey(projectId);
    const seen = new Map<string, number>();
    seen.set(activeDbKey, 0);

    for (const log of this.data.auditLogs) {
      if (log.projectId === projectId) {
        const key = log.databaseKey || activeDbKey;
        seen.set(key, (seen.get(key) || 0) + 1);
      }
    }

    const results: { key: string; name: string; logCount: number; isActive: boolean }[] = [];
    results.push({
      key: activeDbKey,
      name: this.formatDbKeyName(activeDbKey),
      logCount: seen.get(activeDbKey) || 0,
      isActive: true
    });

    for (const [key, count] of seen.entries()) {
      if (key !== activeDbKey) {
        results.push({
          key,
          name: this.formatDbKeyName(key),
          logCount: count,
          isActive: false
        });
      }
    }

    return results;
  }

  // Chat - Segregated by Workspace (projectId) and Database (databaseKey)
  getDatabaseKey(projectId: string, explicitDbKey?: string): string {
    if (explicitDbKey && explicitDbKey.trim()) {
      return explicitDbKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }
    const project = this.getProjectById(projectId);
    if (!project) return 'default';
    const cfg = project.connectionConfig;
    const rawKey = cfg?.sampleId || cfg?.name || cfg?.database || project.databaseType || 'default';
    return rawKey.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  }

  getChatSessionKey(projectId: string, databaseKey?: string): string {
    const dbKey = this.getDatabaseKey(projectId, databaseKey);
    return `${projectId}::${dbKey}`;
  }

  getChatMessages(projectId: string, databaseKey?: string): ChatMessage[] {
    const sessionKey = this.getChatSessionKey(projectId, databaseKey);
    if (this.data.chatMessages[sessionKey]) {
      return this.data.chatMessages[sessionKey];
    }
    // Backward compatibility: migrate legacy un-scoped messages
    if (this.data.chatMessages[projectId] && this.data.chatMessages[projectId].length > 0) {
      this.data.chatMessages[sessionKey] = [...this.data.chatMessages[projectId]];
      delete this.data.chatMessages[projectId];
      this.save();
      return this.data.chatMessages[sessionKey];
    }
    return [];
  }

  addChatMessage(projectId: string, message: ChatMessage, databaseKey?: string): void {
    const sessionKey = this.getChatSessionKey(projectId, databaseKey);
    if (!this.data.chatMessages[sessionKey]) {
      this.data.chatMessages[sessionKey] = [];
    }
    this.data.chatMessages[sessionKey].push(message);
    this.save();
  }

  clearChatMessages(projectId: string, databaseKey?: string): void {
    const sessionKey = this.getChatSessionKey(projectId, databaseKey);
    this.data.chatMessages[sessionKey] = [];
    if (this.data.chatMessages[projectId]) {
      delete this.data.chatMessages[projectId];
    }
    this.save();
  }

  getChatDatabases(projectId: string): { key: string; name: string; messageCount: number; isActive: boolean }[] {
    const prefix = `${projectId}::`;
    const results: { key: string; name: string; messageCount: number; isActive: boolean }[] = [];
    
    // Always include current active database
    const activeDbKey = this.getDatabaseKey(projectId);
    const activeSessionKey = `${projectId}::${activeDbKey}`;
    const activeCount = this.data.chatMessages[activeSessionKey]?.length || 0;
    
    const seen = new Set<string>();
    seen.add(activeDbKey);
    results.push({
      key: activeDbKey,
      name: this.formatDbKeyName(activeDbKey),
      messageCount: activeCount,
      isActive: true
    });

    for (const [key, msgs] of Object.entries(this.data.chatMessages)) {
      if (key.startsWith(prefix) && msgs.length > 0) {
        const dbKey = key.substring(prefix.length);
        if (!seen.has(dbKey)) {
          seen.add(dbKey);
          results.push({
            key: dbKey,
            name: this.formatDbKeyName(dbKey),
            messageCount: msgs.length,
            isActive: false
          });
        }
      }
    }
    return results;
  }

  formatDbKeyName(key: string): string {
    if (key.includes('healthcare')) return 'Healthcare EHR Database';
    if (key.includes('ecommerce')) return 'E-Commerce Platform Database';
    if (key.includes('fintech')) return 'Fintech Banking Database';
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Settings
  getSettings(): AppSettings {
    return {
      ...this.data.settings,
      geminiApiKeyConfigured: Boolean(process.env.GEMINI_API_KEY)
    };
  }

  updateSettings(settings: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
    return this.data.settings;
  }
}

export const store = new Store();
