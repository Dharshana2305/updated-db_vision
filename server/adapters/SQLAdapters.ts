import pg from 'pg';
import mysql from 'mysql2/promise';
import { DatabaseAdapter, AdapterCapabilities, ConnectionTestResult } from './DatabaseAdapter.js';
import { DatabaseType, DatabaseSchema, QueryResult, TableSchema, ColumnSchema, ForeignKeySchema, IndexSchema } from '../../src/types.js';
import { validateReadOnlySQL } from '../utils/sqlSecurity.js';
import { decryptCredential } from '../utils/crypto.ts';

export class PostgreSQLAdapter implements DatabaseAdapter {
  readonly type = 'postgres' as const;
  private config: any;
  private client: pg.Client | null = null;

  constructor(config: any) {
    this.config = config || {};
  }

  getCapabilities(): AdapterCapabilities {
    return {
      supportsSQL: true,
      supportsNoSQL: false,
      supportsForeignKeys: true,
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

  private getClientConfig() {
    const rawPassword = this.config.password ? decryptCredential(this.config.password) : undefined;
    if (this.config.connectionString) {
      return { connectionString: this.config.connectionString };
    }
    return {
      host: this.config.host || 'localhost',
      port: Number(this.config.port) || 5432,
      user: this.config.username || 'postgres',
      password: rawPassword,
      database: this.config.databaseName || this.config.database || 'postgres',
      connectionTimeoutMillis: 5000
    };
  }

  async connect(): Promise<boolean> {
    try {
      if (this.client) {
        await this.disconnect();
      }
      this.client = new pg.Client(this.getClientConfig());
      await this.client.connect();
      return true;
    } catch (err: any) {
      console.error('PostgreSQL Connection Error:', err.message);
      this.client = null;
      throw new Error(`PostgreSQL connection failed: ${err.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.end();
      } catch {
        // ignore disconnect errors
      }
      this.client = null;
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = performance.now();
    try {
      if (!this.client) {
        await this.connect();
      }
      const res = await this.client!.query('SELECT version();');
      const version = res.rows[0]?.version || 'PostgreSQL';
      const latencyMs = Math.round(performance.now() - start);

      const dbName = this.config.databaseName || this.config.database || 'postgres';
      return {
        success: true,
        message: `Successfully connected to PostgreSQL database "${dbName}"`,
        latencyMs,
        serverVersion: version.split(' ')[0] + ' ' + (version.split(' ')[1] || '')
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'PostgreSQL connection test failed',
        latencyMs: Math.round(performance.now() - start)
      };
    }
  }

  async extractSchema(): Promise<DatabaseSchema> {
    if (!this.client) await this.connect();
    if (!this.client) throw new Error('Database not connected');

    const dbName = this.config.databaseName || this.config.database || 'postgres';

    // 1. Get user tables
    const tablesRes = await this.client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tables: TableSchema[] = [];
    let totalCols = 0;
    let totalIdx = 0;
    let totalFks = 0;
    let totalRows = 0;

    for (const row of tablesRes.rows) {
      const tableName = row.table_name;

      // 2. Fetch Columns
      const colRes = await this.client.query(`
        SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [tableName]);

      // 3. Fetch Primary Keys
      const pkRes = await this.client.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = $1;
      `, [tableName]);

      const primaryKeyColumns = pkRes.rows.map((r: any) => r.column_name);

      // 4. Fetch Foreign Keys
      const fkRes = await this.client.query(`
        SELECT
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.update_rule,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = $1;
      `, [tableName]);

      const foreignKeys: ForeignKeySchema[] = fkRes.rows.map((r: any) => ({
        columnName: r.column_name,
        referencedTable: r.foreign_table_name,
        referencedColumn: r.foreign_column_name,
        onUpdate: r.update_rule,
        onDelete: r.delete_rule,
        inferred: false,
        confidence: 100
      }));
      totalFks += foreignKeys.length;

      // 5. Fetch Indexes
      const idxRes = await this.client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = $1;
      `, [tableName]);

      const indexes: IndexSchema[] = idxRes.rows.map((r: any) => ({
        name: r.indexname,
        columns: [r.indexname], // simplified column extraction
        isUnique: r.indexdef.toUpperCase().includes('UNIQUE'),
        isPrimary: r.indexname.endsWith('_pkey')
      }));
      totalIdx += indexes.length;

      // 6. Row count & Sample Rows
      let rowCount = 0;
      let sampleRows: Record<string, any>[] = [];

      try {
        const countRes = await this.client.query(`SELECT COUNT(*) FROM "${tableName}";`);
        rowCount = parseInt(countRes.rows[0].count, 10) || 0;
        totalRows += rowCount;

        const sampleRes = await this.client.query(`SELECT * FROM "${tableName}" LIMIT 10;`);
        sampleRows = sampleRes.rows;
      } catch {
        // ignore table row query errors
      }

      const columns: ColumnSchema[] = colRes.rows.map((c: any) => {
        const isPk = primaryKeyColumns.includes(c.column_name);
        const isFk = foreignKeys.some(f => f.columnName === c.column_name);

        return {
          name: c.column_name,
          dataType: c.data_type.toUpperCase(),
          isNullable: c.is_nullable === 'YES',
          isPrimaryKey: isPk,
          isForeignKey: isFk,
          defaultValue: c.column_default
        };
      });
      totalCols += columns.length;

      tables.push({
        name: tableName,
        type: 'table',
        rowCount,
        columns,
        indexes,
        primaryKey: primaryKeyColumns,
        foreignKeys,
        sampleRows
      });
    }

    return {
      tables,
      databaseName: dbName,
      databaseType: 'postgres',
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

  async profileTable(tableName: string, maxRows = 500): Promise<{
    nullCounts: Record<string, number>;
    distinctCounts: Record<string, number>;
    sampleRows: Record<string, any>[];
    totalRows: number;
  }> {
    if (!this.client) await this.connect();
    if (!this.client) throw new Error('Database not connected');

    const countRes = await this.client.query(`SELECT COUNT(*) FROM "${tableName}";`);
    const totalRows = parseInt(countRes.rows[0].count, 10) || 0;

    const sampleRes = await this.client.query(`SELECT * FROM "${tableName}" LIMIT $1;`, [Math.min(maxRows, 500)]);
    const sampleRows = sampleRes.rows;

    const nullCounts: Record<string, number> = {};
    const distinctCounts: Record<string, number> = {};

    if (sampleRows.length > 0) {
      const keys = Object.keys(sampleRows[0]);
      keys.forEach(k => {
        nullCounts[k] = sampleRows.filter(r => r[k] === null || r[k] === undefined).length;
        distinctCounts[k] = new Set(sampleRows.map(r => r[k])).size;
      });
    }

    return { nullCounts, distinctCounts, sampleRows: sampleRows.slice(0, 50), totalRows };
  }

  async executeQuery(query: string, options?: { maxRows?: number }): Promise<QueryResult> {
    if (!this.client) await this.connect();
    if (!this.client) throw new Error('Database not connected');

    const validation = validateReadOnlySQL(query);
    if (!validation.isSafe) {
      throw new Error(`Read-Only Execution Blocked: ${validation.reason}`);
    }

    const start = performance.now();
    const res = await this.client.query(query);
    const executionTimeMs = Math.round((performance.now() - start) * 100) / 100;

    const fields = res.fields ? res.fields.map(f => f.name) : (res.rows[0] ? Object.keys(res.rows[0]) : []);
    const limit = options?.maxRows || 200;
    const rows = res.rows.slice(0, limit);

    return {
      columns: fields,
      rows,
      rowCount: res.rowCount || res.rows.length,
      executionTimeMs
    };
  }

  async executeModification(sqlOrOp: string): Promise<{ success: boolean; affectedRows?: number; message?: string }> {
    if (!this.client) await this.connect();
    if (!this.client) throw new Error('Database not connected');

    try {
      const res = await this.client.query(sqlOrOp);
      return {
        success: true,
        affectedRows: res.rowCount || 0,
        message: 'PostgreSQL database modification executed successfully.'
      };
    } catch (err: any) {
      if (/already exists|duplicate key|duplicate column/i.test(err?.message || '')) {
        return {
          success: true,
          affectedRows: 0,
          message: `Already applied on PostgreSQL database (${err.message})`
        };
      }
      return {
        success: false,
        message: err.message || 'Error executing PostgreSQL modification'
      };
    }
  }

  async getExplainPlan(query: string): Promise<any> {
    if (!this.client) await this.connect();
    if (!this.client) throw new Error('Database not connected');
    const res = await this.client.query(`EXPLAIN ANALYZE ${query}`);
    return res.rows;
  }
}

export class MySQLAdapter implements DatabaseAdapter {
  readonly type: DatabaseType = 'mysql';
  private config: any;
  private connection: mysql.Connection | null = null;

  constructor(config: any) {
    this.config = config || {};
  }

  getCapabilities(): AdapterCapabilities {
    return {
      supportsSQL: true,
      supportsNoSQL: false,
      supportsForeignKeys: true,
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

  private getConnectionConfig() {
    const rawPassword = this.config.password ? decryptCredential(this.config.password) : undefined;
    if (this.config.connectionString) {
      return this.config.connectionString;
    }
    return {
      host: this.config.host || 'localhost',
      port: Number(this.config.port) || 3306,
      user: this.config.username || 'root',
      password: rawPassword,
      database: this.config.databaseName || this.config.database,
      connectTimeout: 5000
    };
  }

  async connect(): Promise<boolean> {
    try {
      if (this.connection) {
        await this.disconnect();
      }
      this.connection = await mysql.createConnection(this.getConnectionConfig());
      return true;
    } catch (err: any) {
      console.error('MySQL Connection Error:', err.message);
      this.connection = null;
      throw new Error(`MySQL connection failed: ${err.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.end();
      } catch {
        // ignore
      }
      this.connection = null;
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const start = performance.now();
    try {
      if (!this.connection) {
        await this.connect();
      }
      const [rows]: any = await this.connection!.query('SELECT VERSION() as version;');
      const version = rows[0]?.version || 'MySQL';
      const latencyMs = Math.round(performance.now() - start);

      const dbName = this.config.databaseName || this.config.database || 'mysql';
      return {
        success: true,
        message: `Successfully connected to MySQL database "${dbName}"`,
        latencyMs,
        serverVersion: `MySQL v${version}`
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'MySQL connection test failed',
        latencyMs: Math.round(performance.now() - start)
      };
    }
  }

  async extractSchema(): Promise<DatabaseSchema> {
    if (!this.connection) await this.connect();
    if (!this.connection) throw new Error('Database not connected');

    const dbName = this.config.databaseName || this.config.database || 'mysql';

    // 1. Get Tables
    const [tablesRows]: any = await this.connection.query(
      `SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [dbName]
    );

    const tables: TableSchema[] = [];
    let totalCols = 0;
    let totalIdx = 0;
    let totalFks = 0;
    let totalRows = 0;

    for (const row of tablesRows) {
      const tableName = row.TABLE_NAME;

      // 2. Fetch Columns
      const [colRows]: any = await this.connection.query(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY 
         FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [dbName, tableName]
      );

      // 3. Fetch Foreign Keys
      const [fkRows]: any = await this.connection.query(
        `SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME 
         FROM information_schema.KEY_COLUMN_USAGE 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
        [dbName, tableName]
      );

      const foreignKeys: ForeignKeySchema[] = fkRows.map((r: any) => ({
        columnName: r.COLUMN_NAME,
        referencedTable: r.REFERENCED_TABLE_NAME,
        referencedColumn: r.REFERENCED_COLUMN_NAME,
        inferred: false,
        confidence: 100
      }));
      totalFks += foreignKeys.length;

      // 4. Primary key columns
      const primaryKeys: string[] = colRows.filter((c: any) => c.COLUMN_KEY === 'PRI').map((c: any) => c.COLUMN_NAME);

      // 5. Indexes
      const [idxRows]: any = await this.connection.query(
        `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [dbName, tableName]
      );

      const indexMap: Record<string, string[]> = {};
      idxRows.forEach((r: any) => {
        if (!indexMap[r.INDEX_NAME]) indexMap[r.INDEX_NAME] = [];
        indexMap[r.INDEX_NAME].push(r.COLUMN_NAME);
      });

      const indexes: IndexSchema[] = Object.entries(indexMap).map(([name, cols]) => ({
        name,
        columns: cols,
        isUnique: name === 'PRIMARY' || idxRows.some((r: any) => r.INDEX_NAME === name && r.NON_UNIQUE === 0),
        isPrimary: name === 'PRIMARY'
      }));
      totalIdx += indexes.length;

      // 6. Sample Rows & Count
      let rowCount = 0;
      let sampleRows: Record<string, any>[] = [];

      try {
        const [countRes]: any = await this.connection.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
        rowCount = countRes[0]?.count || 0;
        totalRows += rowCount;

        const [sampleRes]: any = await this.connection.query(`SELECT * FROM \`${tableName}\` LIMIT 10`);
        sampleRows = sampleRes;
      } catch {
        // ignore
      }

      const columns: ColumnSchema[] = colRows.map((c: any) => ({
        name: c.COLUMN_NAME,
        dataType: c.DATA_TYPE.toUpperCase(),
        isNullable: c.IS_NULLABLE === 'YES',
        isPrimaryKey: c.COLUMN_KEY === 'PRI',
        isForeignKey: foreignKeys.some(f => f.columnName === c.COLUMN_NAME),
        defaultValue: c.COLUMN_DEFAULT
      }));
      totalCols += columns.length;

      tables.push({
        name: tableName,
        type: 'table',
        rowCount,
        columns,
        indexes,
        primaryKey: primaryKeys,
        foreignKeys,
        sampleRows
      });
    }

    return {
      tables,
      databaseName: dbName,
      databaseType: 'mysql',
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

  async profileTable(tableName: string, maxRows = 500): Promise<{
    nullCounts: Record<string, number>;
    distinctCounts: Record<string, number>;
    sampleRows: Record<string, any>[];
    totalRows: number;
  }> {
    if (!this.connection) await this.connect();
    if (!this.connection) throw new Error('Database not connected');

    const [countRes]: any = await this.connection.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
    const totalRows = countRes[0]?.count || 0;

    const [sampleRows]: any = await this.connection.query(`SELECT * FROM \`${tableName}\` LIMIT ?`, [Math.min(maxRows, 500)]);

    const nullCounts: Record<string, number> = {};
    const distinctCounts: Record<string, number> = {};

    if (sampleRows.length > 0) {
      const keys = Object.keys(sampleRows[0]);
      keys.forEach(k => {
        nullCounts[k] = sampleRows.filter((r: any) => r[k] === null || r[k] === undefined).length;
        distinctCounts[k] = new Set(sampleRows.map((r: any) => r[k])).size;
      });
    }

    return { nullCounts, distinctCounts, sampleRows: sampleRows.slice(0, 50), totalRows };
  }

  async executeQuery(query: string, options?: { maxRows?: number }): Promise<QueryResult> {
    if (!this.connection) await this.connect();
    if (!this.connection) throw new Error('Database not connected');

    const validation = validateReadOnlySQL(query);
    if (!validation.isSafe) {
      throw new Error(`Read-Only Execution Blocked: ${validation.reason}`);
    }

    const start = performance.now();
    const [rows, fields]: any = await this.connection.query(query);
    const executionTimeMs = Math.round((performance.now() - start) * 100) / 100;

    const colNames = fields ? fields.map((f: any) => f.name) : (rows[0] ? Object.keys(rows[0]) : []);
    const limit = options?.maxRows || 200;

    return {
      columns: colNames,
      rows: (Array.isArray(rows) ? rows : []).slice(0, limit),
      rowCount: Array.isArray(rows) ? rows.length : 0,
      executionTimeMs
    };
  }

  async executeModification(sqlOrOp: string): Promise<{ success: boolean; affectedRows?: number; message?: string }> {
    if (!this.connection) await this.connect();
    if (!this.connection) throw new Error('Database not connected');

    try {
      const [result]: any = await this.connection.query(sqlOrOp);
      return {
        success: true,
        affectedRows: result?.affectedRows || 0,
        message: 'MySQL modification applied successfully.'
      };
    } catch (err: any) {
      if (/duplicate column name|already exists|duplicate key/i.test(err?.message || '')) {
        return {
          success: true,
          affectedRows: 0,
          message: `Already applied on MySQL database (${err.message})`
        };
      }
      return {
        success: false,
        message: err.message || 'MySQL modification execution error'
      };
    }
  }

  async getExplainPlan(query: string): Promise<any> {
    if (!this.connection) await this.connect();
    if (!this.connection) throw new Error('Database not connected');
    const [rows]: any = await this.connection.query(`EXPLAIN ${query}`);
    return rows;
  }
}

export class MariaDBAdapter extends MySQLAdapter {
  override readonly type: DatabaseType = 'mariadb';
}

export class SQLServerAdapter implements DatabaseAdapter {
  readonly type = 'sqlserver' as const;
  constructor(private config: any) {}
  getCapabilities(): AdapterCapabilities {
    return {
      supportsSQL: true, supportsNoSQL: false, supportsForeignKeys: true, supportsIndexes: true,
      supportsExplainPlan: false, supportsSafeModifications: true, supportsTransactions: true,
      supportsBenchmark: false, supportsDataProfiling: false, supportsDirectRollback: false,
      supportedConnectionTypes: ['credentials']
    };
  }
  async connect(): Promise<boolean> { throw new Error('SQL Server direct protocol driver is not configured.'); }
  async disconnect(): Promise<void> {}
  async testConnection(): Promise<ConnectionTestResult> { return { success: false, message: 'SQL Server connection driver is uninstalled or unsupported in this environment.' }; }
  async extractSchema(): Promise<DatabaseSchema> { throw new Error('SQL Server connection driver is uninstalled.'); }
  async profileTable(): Promise<any> { throw new Error('Unsupported'); }
  async executeQuery(): Promise<QueryResult> { throw new Error('Unsupported'); }
  async executeModification(): Promise<any> { throw new Error('Unsupported'); }
}

export class OracleAdapter implements DatabaseAdapter {
  readonly type = 'oracle' as const;
  constructor(private config: any) {}
  getCapabilities(): AdapterCapabilities {
    return {
      supportsSQL: true, supportsNoSQL: false, supportsForeignKeys: true, supportsIndexes: true,
      supportsExplainPlan: false, supportsSafeModifications: true, supportsTransactions: true,
      supportsBenchmark: false, supportsDataProfiling: false, supportsDirectRollback: false,
      supportedConnectionTypes: ['credentials']
    };
  }
  async connect(): Promise<boolean> { throw new Error('Oracle DB client driver is not installed in current workspace.'); }
  async disconnect(): Promise<void> {}
  async testConnection(): Promise<ConnectionTestResult> { return { success: false, message: 'Oracle DB client driver is uninstalled.' }; }
  async extractSchema(): Promise<DatabaseSchema> { throw new Error('Oracle DB client driver is uninstalled.'); }
  async profileTable(): Promise<any> { throw new Error('Unsupported'); }
  async executeQuery(): Promise<QueryResult> { throw new Error('Unsupported'); }
  async executeModification(): Promise<any> { throw new Error('Unsupported'); }
}
