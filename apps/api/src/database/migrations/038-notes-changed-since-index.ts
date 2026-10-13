import type { Migration } from '../types.js';

/**
 * Notes changed-since feed (#149): index so the mirror can page
 * org-scoped upserts and delete tombstones by (updated_at, id).
 */
export const migration: Migration = {
  version: 38,
  name: 'notes_changed_since_index',
  up: async (db) => {
    await db.execute({
      sql: `
        CREATE INDEX idx_project_notes_org_updated_id
        ON project_notes (organization_id, updated_at, id)
      `,
    });
  },
};
