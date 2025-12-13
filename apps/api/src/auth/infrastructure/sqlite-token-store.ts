import { DatabaseSync } from 'node:sqlite';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenStore } from '../domain/token-store.js';

export type SqliteTokenStoreOptions = {
  location: string;
};

type TokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
};

const rowToToken = (row: TokenRow): ApiToken => ({
  id: row.id,
  userId: row.user_id,
  tokenHash: row.token_hash,
  name: row.name,
  lastUsedAt: row.last_used_at ?? undefined,
  createdAt: row.created_at,
});

const initialize = (db: DatabaseSync): void => {
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

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_api_tokens_user
    ON api_tokens(user_id)
  `);
};

export const createSqliteTokenStore = (
  options: SqliteTokenStoreOptions
): TokenStore => {
  const db = new DatabaseSync(options.location);
  initialize(db);

  return {
    save: async (token: ApiToken): Promise<void> => {
      const stmt = db.prepare(`
        INSERT INTO api_tokens (id, user_id, token_hash, name, last_used_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        token.id,
        token.userId,
        token.tokenHash,
        token.name,
        token.lastUsedAt ?? null,
        token.createdAt
      );
    },

    findById: async (id: string): Promise<ApiToken | null> => {
      const stmt = db.prepare(`SELECT * FROM api_tokens WHERE id = ?`);
      const row = stmt.get(id) as TokenRow | undefined;
      return row ? rowToToken(row) : null;
    },

    updateLastUsed: async (id: string, timestamp: string): Promise<void> => {
      const stmt = db.prepare(`
        UPDATE api_tokens SET last_used_at = ? WHERE id = ?
      `);
      stmt.run(timestamp, id);
    },

    hasAnyTokens: async (): Promise<boolean> => {
      const stmt = db.prepare(`SELECT 1 FROM api_tokens LIMIT 1`);
      const row = stmt.get();
      return row !== undefined;
    },
  };
};
