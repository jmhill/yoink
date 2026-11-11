import type { Migration } from '../types.js';

/**
 * M5.8b: copy designated mirror-bot ids into notes_settings.
 * A null column stays null and gets no settings row. The organizations
 * column stays the source of truth until M5.8c. Nothing reads the new rows yet.
 *
 * Owner is platform because this statement names both organizations and
 * notes_settings. A notes-owned migration cannot read the access column.
 */
export const migration: Migration = {
  version: 46,
  name: 'backfill_notes_settings',
  owner: 'platform',
  reason:
    'M5.8b copies non-null organizations.notes_mirror_bot_user_id into notes_settings. The old column stays the source of truth until M5.8c.',
  up: async (db) => {
    await db.execute({
      sql: `
        INSERT INTO notes_settings (organization_id, notes_mirror_bot_user_id)
        SELECT id, notes_mirror_bot_user_id
        FROM organizations
        WHERE notes_mirror_bot_user_id IS NOT NULL
      `,
    });
  },
};
