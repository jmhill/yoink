import type { Migration } from '../types.js';

export const migration: Migration = {
  version: 4,
  name: 'create_captures',
  up: async (db) => {
    await db.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS captures (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          created_by_id TEXT NOT NULL,
          content TEXT NOT NULL,
          title TEXT,
          source_url TEXT,
          source_app TEXT,
          status TEXT NOT NULL DEFAULT 'inbox',
          captured_at TEXT NOT NULL,
          archived_at TEXT
        )
      `,
    });
    await db.execute({
      sql: `
        CREATE INDEX IF NOT EXISTS idx_captures_org_status 
        ON captures(organization_id, status, captured_at DESC)
      `,
    });
  },
};
