import type { Migration } from '../types.js';

/**
 * Removes organization_id from users table.
 *
 * This is the "contract" phase of the expand-migrate-contract pattern.
 * User organization membership is now tracked in the organization_memberships
 * table, so the redundant organization_id column can be removed.
 *
 * SQLite doesn't support DROP COLUMN directly in all versions, so we
 * recreate the table without the column.
 */
export const migration: Migration = {
  version: 20,
  name: 'remove_organization_id_from_users',
  up: async (db) => {
    // SQLite approach: create new table, copy data, drop old, rename new
    // Made idempotent to handle partial application from previous failed runs
    
    // 0. Clean up any leftover users_new from a previous failed run
    await db.execute({
      sql: `DROP TABLE IF EXISTS users_new`,
    });

    // 1. Create new table without organization_id
    await db.execute({
      sql: `
        CREATE TABLE users_new (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        )
      `,
    });

    // 2. Copy data (excluding organization_id)
    await db.execute({
      sql: `
        INSERT INTO users_new (id, email, created_at)
        SELECT id, email, created_at FROM users
      `,
    });

    // 3. Drop old table
    await db.execute({
      sql: `DROP TABLE users`,
    });

    // 4. Rename new table
    await db.execute({
      sql: `ALTER TABLE users_new RENAME TO users`,
    });

    // 5. Recreate index on email (UNIQUE constraint creates implicit index, but be explicit)
    await db.execute({
      sql: `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    });
  },
};
