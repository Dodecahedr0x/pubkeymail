/**
 * Database Connection
 * PostgreSQL connection pool management
 *
 * CRITICAL: Database uses C collation for case-sensitive string comparisons
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { databaseConfig } from '../config/index.js';

/**
 * PostgreSQL connection pool
 * Singleton instance shared across the application
 */
class DatabasePool {
  private pool: Pool | null = null;

  /**
   * Get or create connection pool
   */
  getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: databaseConfig.url,
        max: databaseConfig.poolSize,
        idleTimeoutMillis: databaseConfig.idleTimeout,
        connectionTimeoutMillis: databaseConfig.connectionTimeout,
      });

      // Handle pool errors
      this.pool.on('error', (err) => {
        console.error('Unexpected database pool error:', err);
      });
    }

    return this.pool;
  }

  /**
   * Execute a query
   * @param text - SQL query string
   * @param params - Query parameters
   */
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const pool = this.getPool();
    return await pool.query<T>(text, params);
  }

  /**
   * Get a client from the pool for transactions
   */
  async getClient(): Promise<PoolClient> {
    const pool = this.getPool();
    return await pool.connect();
  }

  /**
   * Close all connections
   * Should be called on application shutdown
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW()');
      return result.rows.length > 0;
    } catch {
      return false;
    }
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
