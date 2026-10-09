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
   * Use for SELECT, INSERT, UPDATE, DELETE.
   */
  execute: (query: { sql: string; args?: unknown[] }) => Promise<QueryResult>;

  /**
   * Execute multiple SQL statements in a batch (one transaction).
   * Use for migrations, multi-statement operations, or a consistent read.
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
