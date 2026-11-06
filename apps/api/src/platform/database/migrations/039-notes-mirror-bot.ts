import type { Migration } from '../types.js';

/**
 * Notes-mirror (#149): one designated bot member id per org.
 * Import is allowed only for that user id (or NOTES_MIRROR_BOT_USER_ID).
 */
export const migration: Migration = {
  version: 39,
  name: 'notes_mirror_bot',
  up: async (db) => {
    await db.execute({
      sql: `ALTER TABLE organizations ADD COLUMN notes_mirror_bot_user_id TEXT`,
    });
  },
};
