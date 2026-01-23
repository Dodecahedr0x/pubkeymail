/**
 * Test utilities for creating mock PostgreSQL query results
 */

import { QueryResult, QueryResultRow } from 'pg';

/**
 * Creates a mock QueryResult with proper typing
 * @param rows - Array of row objects
 * @param rowCount - Optional row count (defaults to rows.length for SELECT, provided value for INSERT/UPDATE/DELETE)
 */
export function mockQueryResult<T extends QueryResultRow = QueryResultRow>(
  rows: T[],
  rowCount?: number
): QueryResult<T> {
  return {
    rows,
    rowCount: rowCount ?? rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}

/**
 * Creates a mock QueryResult for INSERT/UPDATE/DELETE operations
 * @param rowCount - Number of affected rows
 */
export function mockMutationResult(rowCount: number): QueryResult<QueryResultRow> {
  return {
    rows: [],
    rowCount,
    command: 'UPDATE',
    oid: 0,
    fields: [],
  };
}
