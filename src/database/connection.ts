/**
 * Database Connection
 * PostgreSQL or In-Memory database connection management
 *
 * CRITICAL: Database uses C collation for case-sensitive string comparisons
 * In local dev mode, uses in-memory database with same behavior
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { databaseConfig, isLocalDevMode } from '../config/index.js';
import {
  getMemoryDatabase,
  initMemoryDatabase,
  closeMemoryDatabase,
  type MemoryDatabase,
} from './memory-db.js';

interface DatabaseInterface {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
  getClient(): Promise<PoolClient>;
  close(): Promise<void>;
  testConnection(): Promise<boolean>;
}

/**
 * PostgreSQL connection pool
 * Used in production mode
 */
class PostgresPool implements DatabaseInterface {
  private pool: Pool | null = null;

  getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: databaseConfig.url,
        max: databaseConfig.poolSize,
        idleTimeoutMillis: databaseConfig.idleTimeout,
        connectionTimeoutMillis: databaseConfig.connectionTimeout,
      });

      this.pool.on('error', (err) => {
        console.error('Unexpected database pool error:', err);
      });
    }

    return this.pool;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const pool = this.getPool();
    return await pool.query<T>(text, params);
  }

  async getClient(): Promise<PoolClient> {
    const pool = this.getPool();
    return await pool.connect();
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW()');
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }
}

/**
 * Memory database adapter
 * Used in local dev mode
 */
class MemoryDatabaseAdapter implements DatabaseInterface {
  private memDb: MemoryDatabase | null = null;

  private getDb(): MemoryDatabase {
    if (!this.memDb) {
      this.memDb = getMemoryDatabase();
    }
    return this.memDb;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const db = this.getDb();
    if (!db.isConnected) {
      await initMemoryDatabase();
    }
    return db.query<T>(text, params);
  }

  async getClient(): Promise<PoolClient> {
    const db = this.getDb();
    if (!db.isConnected) {
      await initMemoryDatabase();
    }
    return db.getClient();
  }

  async close(): Promise<void> {
    await closeMemoryDatabase();
    this.memDb = null;
  }

  async testConnection(): Promise<boolean> {
    const db = this.getDb();
    if (!db.isConnected) {
      await initMemoryDatabase();
    }
    return db.testConnection();
  }
}

/**
 * Database singleton
 * Automatically selects PostgreSQL or in-memory based on configuration
 */
class DatabasePool {
  private implementation: DatabaseInterface;

  constructor() {
    if (isLocalDevMode) {
      console.log('🧪 Using in-memory database (local dev mode)');
      this.implementation = new MemoryDatabaseAdapter();
    } else {
      this.implementation = new PostgresPool();
    }
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    return this.implementation.query<T>(text, params);
  }

  async getClient(): Promise<PoolClient> {
    return this.implementation.getClient();
  }

  async close(): Promise<void> {
    return this.implementation.close();
  }

  async testConnection(): Promise<boolean> {
    return this.implementation.testConnection();
  }
}

// Export singleton instance
export const db = new DatabasePool();

/**
 * Transaction helper
 * Executes a function within a database transaction
 *
 * @param callback - Function to execute in transaction
 * @returns Result of callback
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
