import type { Migration } from '../types.js';

export const migration: Migration = {
  version: 2,
  name: 'create_users',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id)`);
  },
};
