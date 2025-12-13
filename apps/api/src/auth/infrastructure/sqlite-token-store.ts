import type { DatabaseSync } from 'node:sqlite';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenStore } from '../domain/token-store.js';

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

/**
 * Validates that the required database schema exists.
 * Throws an error if migrations have not been run.
 */
const validateSchema = (db: DatabaseSync): void => {
  const table = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='api_tokens'`
    )
    .get();

  if (!table) {
    throw new Error(
      'TokenStore requires "api_tokens" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteTokenStore = (db: DatabaseSync): TokenStore => {
  validateSchema(db);

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
