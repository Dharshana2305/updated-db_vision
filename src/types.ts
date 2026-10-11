export type DatabaseType =
  | 'sqlite'
  | 'mysql'
  | 'postgres'
  | 'postgresql'
  | 'mariadb'
  | 'sqlserver'
  | 'oracle'
  | 'mongodb'
  | 'redis'
  | 'cassandra';

export interface User {
  id: string;
  email: string;
  name: string;
  isEmailVerified?: boolean;
  isGuest?: boolean;
  createdAt: string;
}

export interface DatabaseConnectionConfig {
  type: DatabaseType;
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  databaseName?: string;
  database?: string;
  readOnly?: boolean;
  connectionString?: string;
  filePath?: string;
  isSample?: boolean;
  sampleId?: string;
  sqlContent?: string;
}

export interface ColumnSchema {
  name: string;
  dataType: string;
  isNullable: boolean;
  nullable?: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  defaultValue?: any;
  characterMaximumLength?: number;
  numericPrecision?: number;
  comment?: string;
  // Data Profiling info if analyzed
  nullCount?: number;
  nullPercentage?: number;
  distinctCount?: number;
  sampleValues?: any[];
  piiFlag?: {
    type: 'EMAIL' | 'PHONE' | 'SSN' | 'FINANCIAL' | 'PASSWORD' | 'GOV_ID' | 'NAME' | 'ADDRESS';
    confidence: number;
    maskedSample?: string;
  };
}

export interface ForeignKeySchema {
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
  constraintName?: string;
  onDelete?: string;
  onUpdate?: string;
  inferred?: boolean;
  confidence?: number;
  reason?: string;
}

export interface IndexSchema {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

export interface TableSchema {
  name: string;
  type: 'table' | 'collection' | 'view';
  rowCount: number;
  sizeBytes?: number;
  columns: ColumnSchema[];
  indexes: IndexSchema[];
  primaryKey: string[];
  foreignKeys: ForeignKeySchema[];
  sampleRows: Record<string, any>[];
  purpose?: string;
}

export interface DatabaseSchema {
  tables: TableSchema[];
  databaseName: string;
  databaseType: DatabaseType;
  extractedAt: string;
  summary: {
    totalTables: number;
    totalColumns: number;
    totalIndexes: number;
    totalForeignKeys: number;
    totalEstimatedRows: number;
  };
}

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type FindingCategory =
  | 'structure'
  | 'quality'
  | 'performance'
  | 'security'
  | 'relationships'
  | 'maintainability';

export interface Finding {
  id: string;
  title: string;
  category: FindingCategory;
  severity: FindingSeverity;
  description: string;
  evidence: string;
  databaseObject: string;
  table: string;
  column?: string;
  whyItMatters: string;
  recommendation: string;
  confidence: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  expectedImpact: string;
  suggestedFix: string;
  status: 'OPEN' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'DISMISSED';
  notes?: string;
  rollbackSql?: string;
  safeToApplyAuto: boolean;
}

export interface HealthScore {
  overall: number;
  grade?: string;
  categories: {
    structure: number;
    dataQuality: number;
    performance: number;
    security: number;
    relationships: number;
    maintainability: number;
  };
  categoryBreakdown: Record<
    string,
    {
      score: number;
      issuesCount: number;
      criticalCount: number;
      weight: number;
      explanation: string;
    }
  >;
  explanation: string;
  calculatedAt: string;
}

export interface RecommendationItem {
  id: string;
  projectId: string;
  findingId: string;
  title: string;
  problem: string;
  recommendation: string;
  why: string;
  expectedImpact: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  safetyChecks: {
    potentialLocks: string;
    dependencies: string[];
    affectedObjects: string[];
    potentialDataLoss: boolean;
    breakingChanges: boolean;
    safeToApply: boolean;
  };
  proposedOperation: string;
  rollbackOperation: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'FAILED' | 'ROLLED_BACK';
  createdAt?: string;
  appliedAt?: string;
  appliedResult?: string;
  errorMessage?: string;
}

export interface AuditLog {
  id: string;
  projectId: string;
  databaseKey?: string;
  databaseName?: string;
  userId: string;
  action:
    | 'REVIEW_CREATED'
    | 'RECOMMENDATION_APPROVED'
    | 'ALL_RECOMMENDATIONS_APPROVED'
    | 'RECOMMENDATION_REJECTED'
    | 'FIX_APPLIED'
    | 'ALL_FIXES_APPLIED'
    | 'ROLLBACK_EXECUTED'
    | 'QUERY_EXECUTED'
    | 'SCHEMA_MODIFIED'
    | 'DATABASE_CONNECTED'
    | 'DATABASE_EXPORTED'
    | 'AUDIT_RESET';
  targetObject: string;
  details: string;
  sqlExecuted?: string;
  result: 'SUCCESS' | 'FAILURE';
  timestamp: string;
}

export interface Review {
  id: string;
  projectId: string;
  createdAt: string;
  healthScore: HealthScore;
  findings: Finding[];
  summary: string;
  databaseType: DatabaseType;
  schemaSnapshot: DatabaseSchema;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  databaseType: DatabaseType;
  connectionConfig?: DatabaseConnectionConfig;
  connectionStatus: 'DISCONNECTED' | 'CONNECTED' | 'ERROR';
  connectionError?: string;
  createdAt: string;
  updatedAt: string;
  lastReviewId?: string;
  latestHealthScore?: HealthScore;
  totalFindings?: number;
  criticalFindings?: number;
}

export interface SQLAnalysisResult {
  originalSql: string;
  optimizedSql: string;
  isReadOnly: boolean;
  issues: {
    type: string;
    severity: FindingSeverity;
    message: string;
    line?: number;
  }[];
  explanation: string;
  estimatedImpact: string;
  safetyRisk: 'SAFE' | 'POTENTIALLY_SLOW' | 'DESTRUCTIVE';
  benchmark?: {
    originalExecutionMs: number;
    optimizedExecutionMs?: number;
    percentImprovement?: number;
  };
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  executionTimeMs: number;
  chartRecommendation?: 'bar' | 'line' | 'pie' | 'area' | 'table';
  xAxisKey?: string;
  yAxisKey?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  sqlGenerated?: {
    query: string;
    explanation: string;
    requiresApproval: boolean;
    isReadOnly: boolean;
    isDestructive: boolean;
  };
  queryResult?: QueryResult;
  approved?: boolean;
}

export type TableMetadata = TableSchema;
export type ReviewCategory = FindingCategory;

export interface AppSettings {
  ollamaBaseUrl: string;
  ollamaModel: string;
  geminiApiKeyConfigured?: boolean;
  maskPIIBeforeAI?: boolean;
  maxProfileRows?: number;
  theme?: 'dark' | 'light';
  activeAIProvider?: 'ollama' | 'gemini' | 'rule_based';
  timeoutSeconds?: number;
  enablePiiMasking?: boolean;
  fallbackToRules?: boolean;
  globalAutoRepairEmergencyStop?: boolean;
}

export type SystemSettings = AppSettings;

export type RepairRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type RepairStatus =
  | 'QUEUED'
  | 'EXECUTING'
  | 'VERIFIED'
  | 'VERIFICATION_FAILED'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'BLOCKED_HIGH_RISK'
  | 'ALREADY_SATISFIED';

export interface RepairJob {
  id: string;
  projectId: string;
  ruleId: string;
  targetObject: string;
  table: string;
  column?: string;
  riskLevel: RepairRiskLevel;
  title: string;
  description: string;
  proposedSql: string;
  rollbackSql?: string;
  status: RepairStatus;
  fingerprint: string;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  executionDurationMs?: number;
  executedSql?: string;
  verificationDetails?: string;
  errorMessage?: string;
  isAutoRepair: boolean;
}

export interface AutoRepairPolicy {
  projectId: string;
  enabled: boolean;
  allowedRiskLevels: ('LOW' | 'MEDIUM')[];
  maxConcurrentJobs: number;
  emergencyStop: boolean;
  autoScanIntervalMinutes?: number;
}

export interface AutoRepairEngineStatus {
  globalEmergencyStop: boolean;
  workerActive: boolean;
  lastScanTimestamp?: string;
  totalVerifiedRepairs: number;
  totalFailedRepairs: number;
  totalBlockedHighRisk: number;
  activeJobsCount: number;
  queuedJobsCount: number;
}

