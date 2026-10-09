import type { Migration } from '../types.js';

/**
 * Expand: revoke is a soft delete. Token names are unchanged.
 */
export const migration: Migration = {
  version: 27,
  name: 'add_token_revoked_at',
  up: async (db) => {
    await db.execute({
      sql: `ALTER TABLE api_tokens ADD COLUMN revoked_at TEXT`,
    });
  },
};
