import { DatabaseType, DatabaseSchema, QueryResult } from '../../src/types.js';

export interface AdapterCapabilities {
  supportsSQL: boolean;
  supportsNoSQL: boolean;
  supportsForeignKeys: boolean;
  supportsIndexes: boolean;
  supportsExplainPlan: boolean;
  supportsSafeModifications: boolean;
  supportsTransactions: boolean;
  supportsBenchmark: boolean;
  supportsDataProfiling: boolean;
  supportsDirectRollback: boolean;
  supportedConnectionTypes: ('credentials' | 'connectionString' | 'fileUpload' | 'sampleDatabase')[];
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  serverVersion?: string;
  detectedDatabases?: string[];
}

export interface DatabaseAdapter {
  readonly type: DatabaseType;
  getCapabilities(): AdapterCapabilities;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  testConnection(): Promise<ConnectionTestResult>;
  extractSchema(): Promise<DatabaseSchema>;
  profileTable(tableName: string, maxRows: number): Promise<{
    nullCounts: Record<string, number>;
    distinctCounts: Record<string, number>;
    sampleRows: Record<string, any>[];
    totalRows: number;
  }>;
  executeQuery(query: string, options?: { maxRows?: number }): Promise<QueryResult>;
  executeModification(sqlOrOp: string): Promise<{
    success: boolean;
    affectedRows?: number;
    message?: string;
  }>;
  getExplainPlan?(query: string): Promise<any>;
  benchmarkQuery?(query: string, iterations?: number): Promise<{
    averageExecutionMs: number;
    minMs: number;
    maxMs: number;
  }>;
}
