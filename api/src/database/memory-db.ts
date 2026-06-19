/**
 * In-Memory Database
 *
 * Provides a PostgreSQL-compatible in-memory database for local development.
 * Implements the same interface used by the application with PostgreSQL.
 *
 * IMPORTANT: This is for development only. Data is lost on restart.
 * Case-sensitive string comparisons are handled to match PostgreSQL COLLATE "C".
 */

import type { QueryResult, QueryResultRow, PoolClient } from 'pg';

interface TableRow {
  [key: string]: unknown;
}

interface Table {
  columns: string[];
  rows: TableRow[];
  autoIncrement: Record<string, number>;
}

type Tables = {
  blockchain_addresses: Table;
  users: Table;
  emails: Table;
  address_links: Table;
  forwarding_rules: Table;
  encryption_keys: Table;
  subscriptions: Table;
  audit_logs: Table;
  scheduled_deletions: Table;
  payment_requests: Table;
};

class MemoryDatabase {
  private tables: Tables;
  private _isConnected = false;

  constructor() {
    this.tables = this.initializeTables();
  }

  private initializeTables(): Tables {
    return {
      blockchain_addresses: {
        columns: ['id', 'address', 'blockchain', 'created_at'],
        rows: [],
        autoIncrement: { id: 1 },
      },
      users: {
        columns: [
          'id',
          'primary_address_id',
          'subscription_tier',
          'created_at',
          'updated_at',
          'email_preferences',
          'is_deleted',
          'deleted_at',
        ],
        rows: [],
        autoIncrement: { id: 1 },
      },
      emails: {
        columns: [
          'id',
          'recipient_address_id',
          'recipient_email',
          'sender_address',
          'subject',
          'body_text',
          'body_html',
          'headers',
          'attachments',
          'received_at',
          'expires_at',
          'is_encrypted',
          'encryption_metadata',
        ],
        rows: [],
        autoIncrement: {},
      },
      address_links: {
        columns: ['id', 'user_id', 'address_id', 'created_at'],
        rows: [],
        autoIncrement: { id: 1 },
      },
      forwarding_rules: {
        columns: [
          'id',
          'user_id',
          'name',
          'source_address_id',
          'destination_type',
          'destination_value',
          'is_active',
          'priority',
          'filters',
          'created_at',
          'updated_at',
        ],
        rows: [],
        autoIncrement: { id: 1 },
      },
      encryption_keys: {
        columns: [
          'id',
          'user_id',
          'address_id',
          'public_key',
          'key_type',
          'created_at',
        ],
        rows: [],
        autoIncrement: { id: 1 },
      },
      subscriptions: {
        columns: [
          'id',
          'user_id',
          'tier',
          'status',
          'current_period_start',
          'current_period_end',
          'created_at',
          'updated_at',
        ],
        rows: [],
        autoIncrement: { id: 1 },
      },
      audit_logs: {
        columns: [
          'id',
          'user_id',
          'action',
          'resource_type',
          'resource_id',
          'metadata',
          'ip_address',
          'user_agent',
          'created_at',
        ],
        rows: [],
        autoIncrement: { id: 1 },
      },
      scheduled_deletions: {
        columns: [
          'id',
          'user_id',
          'scheduled_at',
          'status',
          'created_at',
          'updated_at',
        ],
        rows: [],
        autoIncrement: { id: 1 },
      },
      payment_requests: {
        columns: [
          'id',
          'reference',
          'user_id',
          'plan',
          'amount',
          'status',
          'signature',
          'created_at',
          'expires_at',
          'confirmed_at',
        ],
        rows: [],
        autoIncrement: { id: 1 },
      },
    };
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<void> {
    this._isConnected = true;
    console.log('In-memory database connected');
  }

  async close(): Promise<void> {
    this._isConnected = false;
    console.log('In-memory database closed');
  }

  async testConnection(): Promise<boolean> {
    return this._isConnected;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const normalizedQuery = text.trim().toUpperCase();

    try {
      if (normalizedQuery.startsWith('SELECT NOW()')) {
        return this.createQueryResult([{ now: new Date() }]) as QueryResult<T>;
      }

      if (normalizedQuery.startsWith('SELECT 1')) {
        return this.createQueryResult([{ health_check: 1 }]) as QueryResult<T>;
      }

      if (normalizedQuery.startsWith('SELECT')) {
        return this.handleSelect(text, params) as QueryResult<T>;
      }

      if (normalizedQuery.startsWith('INSERT')) {
        return this.handleInsert(text, params) as QueryResult<T>;
      }

      if (normalizedQuery.startsWith('UPDATE')) {
        return this.handleUpdate(text, params) as QueryResult<T>;
      }

      if (normalizedQuery.startsWith('DELETE')) {
        return this.handleDelete(text, params) as QueryResult<T>;
      }

      if (
        normalizedQuery.startsWith('BEGIN') ||
        normalizedQuery.startsWith('COMMIT') ||
        normalizedQuery.startsWith('ROLLBACK')
      ) {
        return this.createQueryResult([]) as QueryResult<T>;
      }

      // For unhandled queries, return empty result
      return this.createQueryResult([]) as QueryResult<T>;
    } catch (error) {
      console.error('Memory DB query error:', error, { text, params });
      throw error;
    }
  }

  async getClient(): Promise<PoolClient> {
    return {
      query: (text: string, params?: unknown[]) => this.query(text, params),
      release: () => {},
    } as unknown as PoolClient;
  }

  private handleSelect(
    text: string,
    params?: unknown[]
  ): QueryResult<QueryResultRow> {
    const tableName = this.extractTableName(text);
    if (!tableName || !(tableName in this.tables)) {
      return this.createQueryResult([]);
    }

    const table = this.tables[tableName as keyof Tables];
    let rows = [...table.rows];

    // Handle COUNT queries
    if (text.toUpperCase().includes('COUNT(*)')) {
      const countWhereMatch = text.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|GROUP|$)/is);
      if (countWhereMatch?.[1] && params) {
        rows = this.filterRows(rows, countWhereMatch[1], params);
      }
      return this.createQueryResult([{ count: rows.length.toString() }]);
    }

    // Handle WHERE clause
    const whereMatch = text.match(/WHERE\s+(.+?)(?:ORDER|LIMIT|$)/is);
    if (whereMatch?.[1] && params) {
      rows = this.filterRows(rows, whereMatch[1], params);
    }

    // Handle ORDER BY
    const orderMatch = text.match(/ORDER\s+BY\s+(\w+)\s+(ASC|DESC)?/i);
    if (orderMatch?.[1]) {
      const orderCol = orderMatch[1];
      const orderDir = (orderMatch[2] || 'ASC').toUpperCase();
      rows.sort((a, b) => {
        const aVal = a[orderCol];
        const bVal = b[orderCol];
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        const cmp = aVal < bVal ? -1 : 1;
        return orderDir === 'DESC' ? -cmp : cmp;
      });
    }

    // Handle LIMIT/OFFSET
    const limitMatch = text.match(/LIMIT\s+\$(\d+)/i);
    const offsetMatch = text.match(/OFFSET\s+\$(\d+)/i);

    if (offsetMatch?.[1] && params) {
      const offsetParamIndex = parseInt(offsetMatch[1], 10) - 1;
      const offset = Number(params[offsetParamIndex]) || 0;
      rows = rows.slice(offset);
    }

    if (limitMatch?.[1] && params) {
      const limitParamIndex = parseInt(limitMatch[1], 10) - 1;
      const limit = Number(params[limitParamIndex]) || rows.length;
      rows = rows.slice(0, limit);
    }

    return this.createQueryResult(rows);
  }

  private handleInsert(
    text: string,
    params?: unknown[]
  ): QueryResult<QueryResultRow> {
    const tableName = this.extractTableName(text);
    if (!tableName || !(tableName in this.tables)) {
      return this.createQueryResult([]);
    }

    const table = this.tables[tableName as keyof Tables];

    // Extract column names from INSERT
    const columnsMatch = text.match(/\(([^)]+)\)\s*VALUES/i);
    if (!columnsMatch) {
      return this.createQueryResult([]);
    }

    const columnsStr = columnsMatch[1];
    if (!columnsStr) {
      return this.createQueryResult([]);
    }
    const columns = columnsStr.split(',').map((c) => c.trim());
    const newRow: TableRow = {};

    // Handle auto-increment ID
    if (table.autoIncrement['id'] !== undefined) {
      newRow['id'] = table.autoIncrement['id']++;
    } else if (tableName === 'emails') {
      newRow['id'] = crypto.randomUUID();
    }

    // Set default timestamps
    newRow['created_at'] = new Date();
    newRow['updated_at'] = new Date();
    if (tableName === 'emails') {
      newRow['received_at'] = new Date();
    }

    // Map params to columns
    columns.forEach((col, index) => {
      if (params && index < params.length) {
        newRow[col] = params[index];
      }
    });

    table.rows.push(newRow);

    // Handle RETURNING clause
    if (text.toUpperCase().includes('RETURNING')) {
      return this.createQueryResult([newRow]);
    }

    return this.createQueryResult([], 1);
  }

  private handleUpdate(
    text: string,
    params?: unknown[]
  ): QueryResult<QueryResultRow> {
    const tableName = this.extractTableName(text);
    if (!tableName || !(tableName in this.tables)) {
      return this.createQueryResult([]);
    }

    const table = this.tables[tableName as keyof Tables];

    // Find rows to update
    const updateWhereMatch = text.match(/WHERE\s+(.+?)(?:RETURNING|$)/is);
    let rowsToUpdate = table.rows;
    if (updateWhereMatch?.[1] && params) {
      rowsToUpdate = this.filterRows(table.rows, updateWhereMatch[1], params);
    }

    // Extract SET clause
    const setMatch = text.match(/SET\s+(.+?)\s+WHERE/is);
    if (setMatch?.[1]) {
      const assignments = setMatch[1].split(',');
      rowsToUpdate.forEach((row) => {
        assignments.forEach((assignment) => {
          const parts = assignment.split('=').map((s) => s.trim());
          const col = parts[0];
          const paramPlaceholder = parts[1];
          if (col && paramPlaceholder) {
            const paramMatch = paramPlaceholder.match(/\$(\d+)/);
            if (paramMatch?.[1] && params) {
              const paramIndex = parseInt(paramMatch[1], 10) - 1;
              row[col] = params[paramIndex];
            }
          }
        });
        row['updated_at'] = new Date();
      });
    }

    // Handle RETURNING clause
    if (text.toUpperCase().includes('RETURNING')) {
      return this.createQueryResult(rowsToUpdate);
    }

    return this.createQueryResult([], rowsToUpdate.length);
  }

  private handleDelete(
    text: string,
    params?: unknown[]
  ): QueryResult<QueryResultRow> {
    const tableName = this.extractTableName(text);
    if (!tableName || !(tableName in this.tables)) {
      return this.createQueryResult([]);
    }

    const table = this.tables[tableName as keyof Tables];

    // Find rows to delete
    const deleteWhereMatch = text.match(/WHERE\s+(.+?)$/is);
    if (!deleteWhereMatch?.[1]) {
      // Delete all rows
      const count = table.rows.length;
      table.rows = [];
      return this.createQueryResult([], count);
    }

    const rowsToDelete = this.filterRows(table.rows, deleteWhereMatch[1], params);
    const deletedIds = new Set(rowsToDelete.map((r) => r['id']));
    table.rows = table.rows.filter((r) => !deletedIds.has(r['id']));

    return this.createQueryResult([], rowsToDelete.length);
  }

  private extractTableName(text: string): string | null {
    // Handle FROM clause
    const fromMatch = text.match(/FROM\s+(\w+)/i);
    if (fromMatch) return fromMatch[1] ?? null;

    // Handle INSERT INTO
    const insertMatch = text.match(/INSERT\s+INTO\s+(\w+)/i);
    if (insertMatch) return insertMatch[1] ?? null;

    // Handle UPDATE
    const updateMatch = text.match(/UPDATE\s+(\w+)/i);
    if (updateMatch) return updateMatch[1] ?? null;

    // Handle DELETE FROM
    const deleteMatch = text.match(/DELETE\s+FROM\s+(\w+)/i);
    if (deleteMatch) return deleteMatch[1] ?? null;

    return null;
  }

  private filterRows(
    rows: TableRow[],
    whereClause: string,
    params?: unknown[]
  ): TableRow[] {
    const conditions = whereClause.split(/\s+AND\s+/i);

    return rows.filter((row) => {
      return conditions.every((condition) => {
        // Handle: column = $N (with optional COLLATE)
        const equalMatch = condition.match(
          /(\w+)\s*=\s*\$(\d+)(?:\s+COLLATE\s+"C")?/i
        );
        if (equalMatch) {
          const column = equalMatch[1];
          const paramNum = equalMatch[2];
          if (column && paramNum && params) {
            const paramIndex = parseInt(paramNum, 10) - 1;
            const paramValue = params[paramIndex];
            return row[column] === paramValue;
          }
        }

        // Handle: column ILIKE $N
        const ilikeMatch = condition.match(/(\w+)\s+ILIKE\s+\$(\d+)/i);
        if (ilikeMatch) {
          const column = ilikeMatch[1];
          const paramNum = ilikeMatch[2];
          if (column && paramNum && params) {
            const paramIndex = parseInt(paramNum, 10) - 1;
            const paramValue = String(params[paramIndex] || '')
              .replace(/%/g, '.*')
              .replace(/_/g, '.');
            const regex = new RegExp(paramValue, 'i');
            return regex.test(String(row[column] || ''));
          }
        }

        // Handle: column IS NULL
        const isNullMatch = condition.match(/(\w+)\s+IS\s+NULL/i);
        if (isNullMatch) {
          const column = isNullMatch[1];
          if (column) {
            return row[column] === null || row[column] === undefined;
          }
        }

        // Handle: column IS NOT NULL
        const isNotNullMatch = condition.match(/(\w+)\s+IS\s+NOT\s+NULL/i);
        if (isNotNullMatch) {
          const column = isNotNullMatch[1];
          if (column) {
            return row[column] !== null && row[column] !== undefined;
          }
        }

        // Handle: column < $N or column > $N
        const comparisonMatch = condition.match(/(\w+)\s*([<>]=?)\s*\$(\d+)/);
        if (comparisonMatch) {
          const column = comparisonMatch[1];
          const op = comparisonMatch[2];
          const paramNum = comparisonMatch[3];
          if (column && op && paramNum && params) {
            const paramIndex = parseInt(paramNum, 10) - 1;
            const paramValue = params[paramIndex];
            const rowValue = row[column];

            if (rowValue instanceof Date && paramValue instanceof Date) {
              switch (op) {
                case '<':
                  return rowValue < paramValue;
                case '>':
                  return rowValue > paramValue;
                case '<=':
                  return rowValue <= paramValue;
                case '>=':
                  return rowValue >= paramValue;
              }
            }

            if (typeof rowValue === 'number' && typeof paramValue === 'number') {
              switch (op) {
                case '<':
                  return rowValue < paramValue;
                case '>':
                  return rowValue > paramValue;
                case '<=':
                  return rowValue <= paramValue;
                case '>=':
                  return rowValue >= paramValue;
              }
            }
          }
        }

        // Default: include row if condition not understood
        return true;
      });
    });
  }

  private createQueryResult(
    rows: TableRow[],
    rowCount?: number
  ): QueryResult<QueryResultRow> {
    return {
      rows: rows as QueryResultRow[],
      rowCount: rowCount ?? rows.length,
      command: '',
      oid: 0,
      fields: [],
    };
  }

  reset(): void {
    this.tables = this.initializeTables();
  }
}

let memoryDb: MemoryDatabase | null = null;

export function getMemoryDatabase(): MemoryDatabase {
  if (!memoryDb) {
    memoryDb = new MemoryDatabase();
  }
  return memoryDb;
}

export async function initMemoryDatabase(): Promise<MemoryDatabase> {
  const db = getMemoryDatabase();
  if (!db.isConnected) {
    await db.connect();
  }
  return db;
}

export async function closeMemoryDatabase(): Promise<void> {
  if (memoryDb && memoryDb.isConnected) {
    await memoryDb.close();
    memoryDb = null;
  }
}

export type { MemoryDatabase };
