import type { Migration } from '../types.js';

/**
 * Adds principal kind and display name to users.
 *
 * Agents are token-only org members (no passkey, no personal org).
 * Existing rows default to kind='human'; name stays null for humans.
 */
export const migration: Migration = {
  version: 21,
  name: 'add_user_kind_and_name',
  up: async (db) => {
    await db.execute({
      sql: `ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'human'`,
    });
    await db.execute({
      sql: `ALTER TABLE users ADD COLUMN name TEXT`,
    });
  },
};
