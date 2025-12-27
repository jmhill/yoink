import type { Migration } from '../types.js';

export const migration: Migration = {
  version: 1,
  name: 'create_organizations',
  up: async (db) => {
    await db.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `,
    });
  },
};
