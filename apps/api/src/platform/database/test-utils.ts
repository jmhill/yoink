import { createDatabase } from './database.js';
import { runMigrations } from './migrator.js';
import { migrations } from './migrations/index.js';
import type { Database } from './types.js';

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
export const createBareTestDatabase = (): Database => {
  return createDatabase({ type: 'memory' });
};

export type { Database };
