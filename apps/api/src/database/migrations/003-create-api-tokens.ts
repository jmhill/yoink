import type { Migration } from '../types.js';

export const migration: Migration = {
  version: 3,
  name: 'create_api_tokens',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        last_used_at TEXT,
        created_at TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id)`);
  },
};
