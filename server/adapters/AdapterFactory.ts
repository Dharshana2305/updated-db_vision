import fs from 'fs';
import { DatabaseAdapter } from './DatabaseAdapter.js';
import { SQLiteAdapter } from './SQLiteAdapter.js';
import { MySQLAdapter, PostgreSQLAdapter, MariaDBAdapter, SQLServerAdapter, OracleAdapter } from './SQLAdapters.js';
import { MongoDBAdapter, RedisAdapter, CassandraAdapter } from './NoSQLAdapters.js';
import { DatabaseConnectionConfig, DatabaseType } from '../../src/types.js';
import { SAMPLE_DATABASES } from './SampleDatabases.js';

// Cache active project database connections in memory
const activeAdapters: Map<string, DatabaseAdapter> = new Map();

export class AdapterFactory {
  static getActiveAdapter(projectId: string): DatabaseAdapter | undefined {
    return activeAdapters.get(projectId);
  }

  static removeAdapter(projectId: string): void {
    const existing = activeAdapters.get(projectId);
    if (existing) {
      existing.disconnect().catch(err => console.warn('Error disconnecting adapter:', err));
      activeAdapters.delete(projectId);
    }
  }

  static async createAdapter(
    projectId: string,
    config: DatabaseConnectionConfig,
    fileBuffer?: Buffer
  ): Promise<DatabaseAdapter> {
    // Disconnect any existing adapter for this project
    this.removeAdapter(projectId);

    let adapter: DatabaseAdapter;

    if (config.filePath && fs.existsSync(config.filePath)) {
      adapter = new SQLiteAdapter({
        filePath: config.filePath,
        databaseName: config.name || 'sqlite_db'
      });
    } else if (config.isSample && config.sampleId) {
      const sample = SAMPLE_DATABASES.find(s => s.id === config.sampleId) || SAMPLE_DATABASES[0];
      adapter = new SQLiteAdapter({
        rawSql: sample.schemaSql,
        filePath: config.filePath,
        databaseName: sample.name
      });
    } else if (fileBuffer) {
      // Check if it's a raw SQL script or binary SQLite database
      const filenameLower = (config.name || '').toLowerCase();
      const isSqlByExt = filenameLower.endsWith('.sql');
      const head = fileBuffer.slice(0, 1024).toString('utf-8');
      const isSqlByContent = /create\s+table/i.test(head) ||
                            head.trim().startsWith('--') ||
                            head.trim().startsWith('/*') ||
                            head.includes(';') ||
                            /insert\s+into/i.test(head);
      const isSqlText = isSqlByExt || isSqlByContent;
      if (isSqlText) {
        adapter = new SQLiteAdapter({
          rawSql: fileBuffer.toString('utf-8'),
          databaseName: config.name || 'imported_sql'
        });
      } else {
        adapter = new SQLiteAdapter({
          fileBuffer,
          databaseName: config.name || 'uploaded_sqlite'
        });
      }
    } else if (config.sqlContent) {
      adapter = new SQLiteAdapter({
        rawSql: config.sqlContent,
        databaseName: config.name || 'custom_sql'
      });
    } else {
      switch (config.type) {
        case 'sqlite':
          adapter = new SQLiteAdapter({
            filePath: config.filePath,
            databaseName: config.databaseName || 'sqlite_db'
          });
          break;
        case 'mysql':
          adapter = new MySQLAdapter(config);
          break;
        case 'postgres':
          adapter = new PostgreSQLAdapter(config);
          break;
        case 'mariadb':
          adapter = new MariaDBAdapter(config);
          break;
        case 'sqlserver':
          adapter = new SQLServerAdapter(config);
          break;
        case 'oracle':
          adapter = new OracleAdapter(config);
          break;
        case 'mongodb':
          adapter = new MongoDBAdapter(config);
          break;
        case 'redis':
          adapter = new RedisAdapter(config);
          break;
        case 'cassandra':
          adapter = new CassandraAdapter(config);
          break;
        default:
          adapter = new SQLiteAdapter({ databaseName: 'default_db' });
      }
    }

    await adapter.connect();
    activeAdapters.set(projectId, adapter);
    return adapter;
  }
}
