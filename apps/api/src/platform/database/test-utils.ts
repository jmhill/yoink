import { createDatabase } from './database.js';
import { runMigrations } from './migrator.js';
import { migrations } from './migrations/index.js';
import { tursoLikeDatabase } from './turso-like-database.js';
import type { Database } from './types.js';

export type BareTestDatabaseOptions = {
  /**
   * Default true. Standalone `PRAGMA foreign_keys = OFF` is ignored, and
   * `batch` turns foreign keys on, matching Turso HTTP. `migrate` passes
   * through. Pass false only when a test has to change foreign keys on this
   * connection, and say why at the call.
   */
  tursoLike?: boolean;
};

/**
 * Create an in-memory test database with all migrations applied.
 * Use this in test files instead of directly using `node:sqlite`.
 */
export const createTestDatabase = async (): Promise<Database> => {
  const db = createDatabase({ type: 'memory' });
  await runMigrations(db, migrations);
  return db;
};

/**
 * Create a bare in-memory database without migrations.
 * Useful for testing migrations themselves.
 */
export const createBareTestDatabase = (options?: BareTestDatabaseOptions): Database => {
  const db = createDatabase({ type: 'memory' });
  if (options?.tursoLike === false) {
    return db;
  }
  return tursoLikeDatabase(db);
};

export type { Database };
