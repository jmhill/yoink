import type { Migration } from '../types.js';

/**
 * M5.8a: notes owns the designated mirror bot. The table is empty.
 * `organizations.notes_mirror_bot_user_id` stays the source of truth until
 * M5.8c. The bot user id is an opaque column, with no users foreign key.
 */
export const migration: Migration = {
  version: 45,
  name: 'create_notes_settings',
  owner: 'notes',
  up: async (db) => {
    await db.execute({
      sql: `
        CREATE TABLE notes_settings (
          organization_id TEXT PRIMARY KEY,
          notes_mirror_bot_user_id TEXT,
          FOREIGN KEY (organization_id) REFERENCES organizations(id)
        )
      `,
    });
  },
};
