/**
 * Database abstraction for LibSQL (Turso and local SQLite).
 *
 * This provides a minimal async interface that works with:
 * - Turso cloud database
 * - Local file-based SQLite via LibSQL
 * - In-memory SQLite for tests
 */

export type QueryResult = {
  rows: Record<string, unknown>[];
  rowsAffected: number;
  lastInsertRowid?: number | bigint;
};

export type Database = {
  /**
   * Execute a single SQL statement.
   * `access: 'read'` may be retried once after a Turso connection failure.
   * Omit `access`, or pass `'write'`, for anything that might commit: those calls time out but are never retried.
   */
  execute: (query: {
    sql: string;
    args?: unknown[];
    access?: 'read' | 'write';
  }) => Promise<QueryResult>;

  /**
   * Execute multiple SQL statements in a batch (one transaction).
   * Mode `'read'` may be retried once. `'write'` (the default) is never retried.
   */
  batch: (
    queries: { sql: string; args?: unknown[] }[],
    mode?: 'write' | 'read'
  ) => Promise<QueryResult[]>;

  /**
   * Close the database connection.
   */
  close: () => Promise<void>;
};

export type Migration = {
  version: number;
  name: string;
  up: (db: Database) => Promise<void>;
};
