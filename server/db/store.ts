import fs from 'fs';
import path from 'path';
import { User, Project, Review, Finding, RecommendationItem, AuditLog, ChatMessage, AppSettings, RepairJob, AutoRepairPolicy } from '../../src/types.js';
import { HealthScorer } from '../engine/HealthScorer.js';

export interface StoredOTP {
  email: string;
  hashedOtp: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  lastResentAt: number;
  resendCount?: number;
}

export interface PasswordResetToken {
  email: string;
  hashedToken: string;
  expiresAt: number;
  used: boolean;
}

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
  repairJobs: RepairJob[];
  repairPolicies: Record<string, AutoRepairPolicy>; // projectId -> policy
  otpStore: Record<string, StoredOTP>; // email -> OTP
  resetTokens: PasswordResetToken[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const DB_BAK_FILE = path.join(DATA_DIR, 'db.json.bak');

const defaultSettings: AppSettings = {
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:3b',
  geminiApiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
  maskPIIBeforeAI: true,
  maxProfileRows: Number(process.env.MAX_PROFILE_ROWS) || 500,
  theme: 'dark',
  activeAIProvider: process.env.GEMINI_API_KEY ? 'gemini' : 'ollama',
  globalAutoRepairEmergencyStop: false
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
    settings: defaultSettings,
    repairJobs: [],
    repairPolicies: {},
    otpStore: {},
    resetTokens: []
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
        try {
          const raw = fs.readFileSync(DB_FILE, 'utf-8');
          const parsed = JSON.parse(raw);
          this.data = {
            ...this.data,
            ...parsed,
            settings: { ...defaultSettings, ...(parsed.settings || {}) },
            repairJobs: Array.isArray(parsed.repairJobs) ? parsed.repairJobs : [],
            repairPolicies: parsed.repairPolicies || {},
            otpStore: parsed.otpStore || {},
            resetTokens: Array.isArray(parsed.resetTokens) ? parsed.resetTokens : []
          };
        } catch (parseErr) {
          console.warn('Primary db.json corrupted, checking db.json.bak for recovery:', parseErr);
          if (fs.existsSync(DB_BAK_FILE)) {
            const bakRaw = fs.readFileSync(DB_BAK_FILE, 'utf-8');
            const bakParsed = JSON.parse(bakRaw);
            this.data = {
              ...this.data,
              ...bakParsed,
              settings: { ...defaultSettings, ...(bakParsed.settings || {}) },
              repairJobs: Array.isArray(bakParsed.repairJobs) ? bakParsed.repairJobs : [],
              repairPolicies: bakParsed.repairPolicies || {},
              otpStore: bakParsed.otpStore || {},
              resetTokens: Array.isArray(bakParsed.resetTokens) ? bakParsed.resetTokens : []
            };
            // Restore primary from valid backup
            this.save();
          }
        }
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
      const jsonContent = JSON.stringify(this.data, null, 2);

      // Verify serialization output is valid before writing
      JSON.parse(jsonContent);

      fs.writeFileSync(tempPath, jsonContent, 'utf-8');

      // Maintain a valid backup file before replacing primary
      if (fs.existsSync(DB_FILE)) {
        try {
          fs.copyFileSync(DB_FILE, DB_BAK_FILE);
        } catch {
          // Non-fatal backup copy
        }
      }

      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Failed to safely save db.json:', err);
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
  resetProjectReviewData(projectId: string): void {
    this.data.reviews = this.data.reviews.filter(r => r.projectId !== projectId);
    this.data.recommendations = this.data.recommendations.filter(r => r.projectId !== projectId);
    this.data.findings = this.data.findings.filter(f => !f.id.startsWith(projectId));
    this.save();
  }

  getReviews(projectId: string): Review[] {
    return this.data.reviews.filter(r => r.projectId === projectId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getReviewById(id: string): Review | undefined {
    return this.data.reviews.find(r => r.id === id);
  }

  createReview(review: Review, preserveApplied = true): Review {
    // Preserve any findings already applied in this project if requested
    if (preserveApplied) {
      const existingRecs = this.getRecommendations(review.projectId);
      const projectReviews = this.getReviews(review.projectId);

      const appliedIds = new Set<string>();
      for (const rev of projectReviews) {
        rev.findings.filter(f => f.status === 'APPLIED').forEach(f => {
          appliedIds.add(f.id);
          appliedIds.add(f.id.replace(/-[0-9]+$/, ''));
        });
      }
      existingRecs.filter(r => r.status === 'APPLIED').forEach(r => {
        appliedIds.add(r.id);
        appliedIds.add(r.id.replace('REC-', ''));
        appliedIds.add(r.id.replace(/-[0-9]+$/, ''));
        appliedIds.add(r.findingId);
        appliedIds.add(r.findingId.replace(/-[0-9]+$/, ''));
      });

      let hasStatusChanges = false;
      review.findings.forEach(f => {
        const cleanId = f.id.replace(/-[0-9]+$/, '');
        if (
          appliedIds.has(f.id) ||
          appliedIds.has(cleanId) ||
          appliedIds.has(`REC-${f.id}`) ||
          appliedIds.has(`REC-${cleanId}`)
        ) {
          if (f.status !== 'APPLIED') {
            f.status = 'APPLIED';
            hasStatusChanges = true;
          }
        }
      });

      // If applied findings were carried forward, re-evaluate health score
      if (hasStatusChanges) {
        review.healthScore = HealthScorer.calculate(review.findings);
      }
    }

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
    const cleanId = findingId.replace(/-[0-9]+$/, '');
    // Update in all matching reviews for this finding, so historical and current reviews stay synchronized
    for (const rev of this.data.reviews) {
      for (let i = 0; i < rev.findings.length; i++) {
        const f = rev.findings[i];
        if (f.id === findingId || f.id === cleanId || f.id.replace(/-[0-9]+$/, '') === cleanId) {
          rev.findings[i] = { ...rev.findings[i], ...updates };
          found = rev.findings[i];
        }
      }
    }
    for (let i = 0; i < this.data.findings.length; i++) {
      const f = this.data.findings[i];
      if (f.id === findingId || f.id === cleanId || f.id.replace(/-[0-9]+$/, '') === cleanId) {
        this.data.findings[i] = { ...this.data.findings[i], ...updates };
        found = this.data.findings[i];
      }
    }
    if (found) this.save();
    return found;
  }

  // Recommendations
  getRecommendations(projectId: string): RecommendationItem[] {
    return this.data.recommendations.filter(r => r.projectId === projectId || r.id.startsWith(projectId) || r.findingId.startsWith(projectId));
  }

  saveRecommendations(projectId: string, recs: RecommendationItem[]): void {
    // Preserve any existing recommendations that are already APPLIED
    const existing = this.data.recommendations.filter(r => r.projectId === projectId);
    const existingApplied = new Map<string, RecommendationItem>();
    existing.forEach(r => {
      if (r.status === 'APPLIED') {
        existingApplied.set(r.id, r);
        existingApplied.set(r.id.replace('REC-', ''), r);
        existingApplied.set(r.id.replace(/-[0-9]+$/, ''), r);
        existingApplied.set(r.findingId, r);
        existingApplied.set(r.findingId.replace(/-[0-9]+$/, ''), r);
      }
    });

    const mergedRecs = recs.map(rec => {
      const cleanFindingId = rec.findingId.replace(/-[0-9]+$/, '');
      const cleanRecId = rec.id.replace(/-[0-9]+$/, '');
      const alreadyApplied = existingApplied.get(rec.id) || existingApplied.get(cleanRecId) || existingApplied.get(rec.findingId) || existingApplied.get(cleanFindingId);
      if (alreadyApplied) {
        return {
          ...rec,
          status: 'APPLIED' as const,
          appliedAt: alreadyApplied.appliedAt || rec.appliedAt || new Date().toISOString(),
          appliedResult: alreadyApplied.appliedResult || rec.appliedResult || 'Remediation applied'
        };
      }
      return rec;
    });

    this.data.recommendations = [
      ...mergedRecs,
      ...this.data.recommendations.filter(r => r.projectId !== projectId)
    ];
    this.save();
  }

  updateRecommendation(id: string, updates: Partial<RecommendationItem>): RecommendationItem | undefined {
    const cleanId = id.replace(/-[0-9]+$/, '');
    const rec = this.data.recommendations.find(r => r.id === id || r.id === cleanId || r.id.replace(/-[0-9]+$/, '') === cleanId);
    if (!rec) return undefined;
    Object.assign(rec, updates);
    if (updates.status === 'APPLIED' && rec.findingId) {
      this.updateFinding(rec.findingId, { status: 'APPLIED' });
    }
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
