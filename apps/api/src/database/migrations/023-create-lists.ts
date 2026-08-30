import type { Migration } from '../types.js';

export const migration: Migration = {
  version: 23,
  name: 'create_lists',
  up: async (db) => {
    await db.execute({
      sql: `
        CREATE TABLE lists (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          created_by_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (organization_id) REFERENCES organizations(id),
          FOREIGN KEY (created_by_id) REFERENCES users(id)
        )
      `,
    });

    await db.execute({
      sql: `
        CREATE INDEX idx_lists_org_name ON lists(
          organization_id,
          name
        )
      `,
    });
  },
};
