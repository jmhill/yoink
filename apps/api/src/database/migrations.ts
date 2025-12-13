import type { DatabaseSync } from 'node:sqlite';

export type Migration = {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
};

/**
 * Database migrations for the Yoink API.
 *
 * Migrations are applied in order by version number.
 * Each migration should be idempotent and forward-only (no down migrations).
 *
 * To add a new migration:
 * 1. Add a new entry with the next version number
 * 2. Give it a descriptive name
 * 3. Implement the up function with the schema changes
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_organizations',
    up: (db) => {
      db.exec(`
        CREATE TABLE organizations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
    },
  },
  {
    version: 2,
    name: 'create_users',
    up: (db) => {
      db.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          email TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX idx_users_organization ON users(organization_id)`);
    },
  },
  {
    version: 3,
    name: 'create_api_tokens',
    up: (db) => {
      db.exec(`
        CREATE TABLE api_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          last_used_at TEXT,
          created_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX idx_api_tokens_user ON api_tokens(user_id)`);
    },
  },
  {
    version: 4,
    name: 'create_captures',
    up: (db) => {
      db.exec(`
        CREATE TABLE captures (
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
      `);
      db.exec(`
        CREATE INDEX idx_captures_org_status 
        ON captures(organization_id, status, captured_at DESC)
      `);
    },
  },
];
