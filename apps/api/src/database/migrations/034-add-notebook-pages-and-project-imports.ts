import type { Migration } from '../types.js';

/**
 * Project import (#139): notebook page paths on each project, plus a
 * staged-import table so a bot can validate a batch and a person can
 * apply or discard it later. No last-moved column — Polly dropped it.
 */
export const migration: Migration = {
  version: 34,
  name: 'add_notebook_pages_and_project_imports',
  up: async (db) => {
    await db.batch(
      [
        {
          sql: `ALTER TABLE projects ADD COLUMN notebook_pages TEXT NOT NULL DEFAULT '[]'`,
        },
        {
          sql: `
            CREATE TABLE project_imports (
              id TEXT PRIMARY KEY,
              organization_id TEXT NOT NULL REFERENCES organizations(id),
              created_by TEXT NOT NULL REFERENCES users(id),
              created_at TEXT NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'discarded')),
              payload_json TEXT NOT NULL,
              decided_by TEXT REFERENCES users(id),
              decided_at TEXT
            )
          `,
        },
        {
          sql: `
            CREATE INDEX idx_project_imports_org_status
            ON project_imports (organization_id, status)
          `,
        },
      ],
      'write'
    );
  },
};
