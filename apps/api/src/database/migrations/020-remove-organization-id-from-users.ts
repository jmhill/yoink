import type { Migration } from '../types.js';
import { rebuildTable } from '../table-rebuild.js';

/**
 * Removes organization_id from users table.
 *
 * This is the "contract" phase of the expand-migrate-contract pattern.
 * User organization membership is now tracked in the organization_memberships
 * table, so the redundant organization_id column can be removed.
 *
 * Uses rebuildTable utility which:
 * - Disables FK constraints during the rebuild (prevents FK violation errors)
 * - Executes all steps atomically in a batch
 * - Re-enables FK constraints after completion
 */
export const migration: Migration = {
  version: 20,
  name: 'remove_organization_id_from_users',
  up: async (db) => {
    // Clean up any leftover users_new from a previous failed run
    await db.execute({
      sql: `DROP TABLE IF EXISTS users_new`,
    });

    await rebuildTable(db, {
      tableName: 'users',
      newSchema: `
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        )
      `,
      columnMapping: 'SELECT id, email, created_at',
      indexes: ['CREATE INDEX idx_users_email ON users(email)'],
    });
  },
};
