import { MongoClient } from 'mongodb';
import { DatabaseAdapter, AdapterCapabilities, ConnectionTestResult } from './DatabaseAdapter.js';
import { DatabaseType, DatabaseSchema, QueryResult, TableSchema, ColumnSchema, ForeignKeySchema, IndexSchema } from '../../src/types.js';
import { decryptCredential } from '../utils/crypto.ts';

export class MongoDBAdapter implements DatabaseAdapter {
  readonly type = 'mongodb' as const;
  private config: any;
  private client: MongoClient | null = null;

  constructor(config: any) {
    this.config = config || {};
  }

  getCapabilities(): AdapterCapabilities {
    return {
      supportsSQL: false,
      supportsNoSQL: true,
      supportsForeignKeys: false,
      supportsIndexes: true,
      supportsExplainPlan: true,
      supportsSafeModifications: true,
      supportsTransactions: true,
      supportsBenchmark: true,
      supportsDataProfiling: true,
      supportsDirectRollback: true,
      supportedConnectionTypes: ['credentials', 'connectionString']
    };
  }

  private getConnectionString(): string {
    if (this.config.connectionString) return this.config.connectionString;
    const rawPass = this.config.password ? decryptCredential(this.config.password) : undefined;
    const host = this.config.host || 'localhost';
    const port = Number(this.config.port) || 27017;
    const db = this.config.databaseName || this.config.database || 'admin';

    if (this.config.username && rawPass) {
      return `mongodb://${encodeURIComponent(this.config.username)}:${encodeURIComponent(rawPass)}@${host}:${port}/${db}`;
    }
    return `mongodb://${host}:${port}/${db}`;
  }

  async connect(): Promise<boolean> {
    try {
      if (this.client) await this.disconnect();
      const uri = this.getConnectionString();
      this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
      await this.client.connect();
      return true;
    } catch (err: any) {
      console.error('MongoDB Connection Error:', err.message);
      this.client = null;
      throw new Error(`MongoDB connection failed: ${err.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // ignore
      }
      this.client = null;
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = performance.now();
    try {
      if (!this.client) await this.connect();
      const dbName = this.config.databaseName || this.config.database || 'admin';
      const adminDb = this.client!.db(dbName).admin();
      const status = await adminDb.serverStatus();
      const latencyMs = Math.round(performance.now() - start);

      return {
        success: true,
        message: `Successfully connected to MongoDB server v${status.version}`,
        latencyMs,
        serverVersion: `MongoDB v${status.version}`
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'MongoDB connection failed',
        latencyMs: Math.round(performance.now() - start)
      };
    }
  }

  async extractSchema(): Promise<DatabaseSchema> {
    if (!this.client) await this.connect();
    if (!this.client) throw new Error('Database not connected');

    const dbName = this.config.databaseName || this.config.database || 'test';
    const db = this.client.db(dbName);

    const collections = await db.listCollections().toArray();
    const tables: TableSchema[] = [];
    let totalCols = 0;
    let totalIdx = 0;
    let totalFks = 0;
    let totalRows = 0;

    for (const colInfo of collections) {
      const colName = colInfo.name;
      if (colName.startsWith('system.')) continue;

      const collection = db.collection(colName);
      const rowCount = await collection.countDocuments();
      totalRows += rowCount;

      const sampleDocs = await collection.find({}).limit(20).toArray();

      // Extract indexes
      let indexes: IndexSchema[] = [];
      try {
        const rawIndexes = await collection.listIndexes().toArray();
        indexes = rawIndexes.map((idx: any) => ({
          name: idx.name,
          columns: Object.keys(idx.key),
          isUnique: Boolean(idx.unique),
          isPrimary: idx.name === '_id_'
        }));
        totalIdx += indexes.length;
      } catch {
        // ignore index fetch error
      }

      // Infer Schema columns & types from sample documents
      const columnMap: Record<string, { dataType: string; isNullable: boolean }> = {};
      sampleDocs.forEach(doc => {
        Object.entries(doc).forEach(([key, val]) => {
          let dataType = 'Unknown';
          if (val === null || val === undefined) dataType = 'Null';
          else if (Array.isArray(val)) dataType = 'Array';
          else if (val instanceof Date) dataType = 'Date';
          else if (typeof val === 'object') dataType = val._bsontype ? val._bsontype : 'Object';
          else dataType = typeof val === 'number' ? (Number.isInteger(val) ? 'Integer' : 'Double') : typeof val;

          if (!columnMap[key]) {
            columnMap[key] = { dataType: dataType.toUpperCase(), isNullable: false };
          }
        });
      });

      const columns: ColumnSchema[] = Object.entries(columnMap).map(([name, info]) => ({
        name,
        dataType: info.dataType,
        isNullable: name !== '_id',
        isPrimaryKey: name === '_id',
        isForeignKey: name.endsWith('Id') || name.endsWith('_id')
      }));
      totalCols += columns.length;

      // Detect potential inferred relationships
      const foreignKeys: ForeignKeySchema[] = columns
        .filter(c => c.isForeignKey && c.name !== '_id')
        .map(c => {
          const targetTable = c.name.replace(/Id$|_id$/i, '') + 's';
          return {
            columnName: c.name,
            referencedTable: targetTable,
            referencedColumn: '_id',
            inferred: true,
            confidence: 85,
            reason: `Field '${c.name}' follows convention matching '${targetTable}' collection primary key`
          };
        });
      totalFks += foreignKeys.length;

      tables.push({
        name: colName,
        type: 'collection',
        rowCount,
        columns,
        indexes,
        primaryKey: ['_id'],
        foreignKeys,
        sampleRows: sampleDocs.slice(0, 10).map(d => JSON.parse(JSON.stringify(d)))
      });
    }

    return {
      tables,
      databaseName: dbName,
      databaseType: 'mongodb',
      extractedAt: new Date().toISOString(),
      summary: {
        totalTables: tables.length,
        totalColumns: totalCols,
        totalIndexes: totalIdx,
        totalForeignKeys: totalFks,
        totalEstimatedRows: totalRows
      }
    };
  }

  async profileTable(tableName: string, maxRows = 500) {
    if (!this.client) await this.connect();
    if (!this.client) throw new Error('Database not connected');

    const dbName = this.config.databaseName || this.config.database || 'test';
    const collection = this.client.db(dbName).collection(tableName);
    const totalRows = await collection.countDocuments();
    const sampleDocs = await collection.find({}).limit(Math.min(maxRows, 500)).toArray();

    const nullCounts: Record<string, number> = {};
    const distinctCounts: Record<string, number> = {};

    if (sampleDocs.length > 0) {
      const keys = new Set<string>();
      sampleDocs.forEach(d => Object.keys(d).forEach(k => keys.add(k)));

      keys.forEach(k => {
        nullCounts[k] = sampleDocs.filter(d => d[k] === null || d[k] === undefined).length;
        distinctCounts[k] = new Set(sampleDocs.map(d => JSON.stringify(d[k]))).size;
      });
    }

    return {
      nullCounts,
      distinctCounts,
      sampleRows: sampleDocs.slice(0, 50).map(d => JSON.parse(JSON.stringify(d))),
      totalRows
    };
  }

  async executeQuery(query: string): Promise<QueryResult> {
    if (!this.client) await this.connect();
    if (!this.client) throw new Error('Database not connected');

    const dbName = this.config.databaseName || this.config.database || 'test';
    const start = performance.now();

    // Parse JSON query command if possible, e.g. {"collection": "users", "filter": {}}
    try {
      const parsed = JSON.parse(query);
      const colName = parsed.collection || parsed.table;
      if (!colName) throw new Error('MongoDB query JSON must specify a "collection" attribute.');

      const collection = this.client.db(dbName).collection(colName);
      const filter = parsed.filter || {};
      const limit = parsed.limit || 100;

      const docs = await collection.find(filter).limit(limit).toArray();
      const executionTimeMs = Math.round((performance.now() - start) * 100) / 100;
      const cleanDocs = docs.map(d => JSON.parse(JSON.stringify(d)));
      const cols = cleanDocs[0] ? Object.keys(cleanDocs[0]) : ['_id'];

      return {
        columns: cols,
        rows: cleanDocs,
        rowCount: cleanDocs.length,
        executionTimeMs
      };
    } catch (err: any) {
      throw new Error(`Invalid MongoDB JSON query format. Expected format: {"collection": "tableName", "filter": {}}. Detail: ${err.message}`);
    }
  }

  async executeModification(sqlOrOp: string) {
    if (!this.client) await this.connect();
    if (!this.client) throw new Error('Database not connected');

    const dbName = this.config.databaseName || this.config.database || 'test';
    try {
      const parsed = JSON.parse(sqlOrOp);
      const colName = parsed.collection;
      if (!colName) throw new Error('MongoDB modification JSON must specify "collection".');

      const collection = this.client.db(dbName).collection(colName);

      if (parsed.createIndex) {
        await collection.createIndex(parsed.createIndex, parsed.options || {});
        return { success: true, affectedRows: 1, message: `MongoDB index created on ${colName}` };
      }

      if (parsed.update) {
        const res = await collection.updateMany(parsed.filter || {}, parsed.update);
        return { success: true, affectedRows: res.modifiedCount, message: `Updated ${res.modifiedCount} documents in ${colName}` };
      }

      throw new Error('Unsupported MongoDB modification command.');
    } catch (err: any) {
      return { success: false, message: err.message || 'MongoDB modification failed' };
    }
  }
}

export class RedisAdapter implements DatabaseAdapter {
  readonly type = 'redis' as const;
  constructor(private config: any) {}
  getCapabilities(): AdapterCapabilities {
    return {
      supportsSQL: false, supportsNoSQL: true, supportsForeignKeys: false, supportsIndexes: false,
      supportsExplainPlan: false, supportsSafeModifications: true, supportsTransactions: false,
      supportsBenchmark: false, supportsDataProfiling: false, supportsDirectRollback: false,
      supportedConnectionTypes: ['credentials']
    };
  }
  async connect(): Promise<boolean> { throw new Error('Redis native client package is not installed.'); }
  async disconnect(): Promise<void> {}
  async testConnection(): Promise<ConnectionTestResult> { return { success: false, message: 'Redis adapter package is uninstalled.' }; }
  async extractSchema(): Promise<DatabaseSchema> { throw new Error('Redis client uninstalled.'); }
  async profileTable(): Promise<any> { throw new Error('Unsupported'); }
  async executeQuery(): Promise<QueryResult> { throw new Error('Unsupported'); }
  async executeModification(): Promise<any> { throw new Error('Unsupported'); }
}

export class CassandraAdapter implements DatabaseAdapter {
  readonly type = 'cassandra' as const;
  constructor(private config: any) {}
  getCapabilities(): AdapterCapabilities {
    return {
      supportsSQL: false, supportsNoSQL: true, supportsForeignKeys: false, supportsIndexes: false,
      supportsExplainPlan: false, supportsSafeModifications: true, supportsTransactions: false,
      supportsBenchmark: false, supportsDataProfiling: false, supportsDirectRollback: false,
      supportedConnectionTypes: ['credentials']
    };
  }
  async connect(): Promise<boolean> { throw new Error('Cassandra CQL client package is not installed.'); }
  async disconnect(): Promise<void> {}
  async testConnection(): Promise<ConnectionTestResult> { return { success: false, message: 'Cassandra adapter package is uninstalled.' }; }
  async extractSchema(): Promise<DatabaseSchema> { throw new Error('Cassandra client uninstalled.'); }
  async profileTable(): Promise<any> { throw new Error('Unsupported'); }
  async executeQuery(): Promise<QueryResult> { throw new Error('Unsupported'); }
  async executeModification(): Promise<any> { throw new Error('Unsupported'); }
}
