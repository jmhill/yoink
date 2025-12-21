import type { Migration } from '../types.js';

export const migration: Migration = {
  version: 5,
  name: 'add_pinned_at_to_captures',
  up: (db) => {
    // Add pinned_at column to captures table
    db.exec(`ALTER TABLE captures ADD COLUMN pinned_at TEXT`);

    // Drop and recreate the index to include pinned_at for efficient sorting
    // Pinned captures (non-null pinned_at) should appear first, then sorted by captured_at
    db.exec(`DROP INDEX IF EXISTS idx_captures_org_status`);
    db.exec(`
      CREATE INDEX idx_captures_org_status 
      ON captures(organization_id, status, pinned_at DESC, captured_at DESC)
    `);
  },
};
