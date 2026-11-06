import type { Migration } from '../types.js';

export const migration: Migration = {
  version: 5,
  name: 'add_pinned_at_to_captures',
  up: async (db) => {
    // Add pinned_at column to captures table
    await db.execute({ sql: `ALTER TABLE captures ADD COLUMN pinned_at TEXT` });

    // Drop and recreate the index to include pinned_at for efficient sorting
    // Pinned captures (non-null pinned_at) should appear first, then sorted by captured_at
    await db.execute({ sql: `DROP INDEX IF EXISTS idx_captures_org_status` });
    await db.execute({
      sql: `
        CREATE INDEX idx_captures_org_status 
        ON captures(organization_id, status, pinned_at DESC, captured_at DESC)
      `,
    });
  },
};
