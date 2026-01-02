import type { Database } from '../../database/types.js';
import { ResultAsync } from 'neverthrow';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenStore } from '../domain/token-store.js';
import { tokenStorageError, type TokenStorageError } from '../domain/auth-errors.js';

type TokenRow = {
  id: string;
  user_id: string;
  organization_id: string;
  token_hash: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
};

const rowToToken = (row: TokenRow): ApiToken => ({
  id: row.id,
  userId: row.user_id,
  organizationId: row.organization_id,
  tokenHash: row.token_hash,
  name: row.name,
  lastUsedAt: row.last_used_at ?? undefined,
  createdAt: row.created_at,
});

/**
 * Validates that the required database schema exists.
 * Throws an error if migrations have not been run.
 */
const validateSchema = async (db: Database): Promise<void> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='api_tokens'`,
  });

  if (result.rows.length === 0) {
    throw new Error(
      'TokenStore requires "api_tokens" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteTokenStore = async (db: Database): Promise<TokenStore> => {
  await validateSchema(db);

  return {
    save: (token: ApiToken): ResultAsync<void, TokenStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            INSERT INTO api_tokens (id, user_id, organization_id, token_hash, name, last_used_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            token.id,
            token.userId,
            token.organizationId,
            token.tokenHash,
            token.name,
            token.lastUsedAt ?? null,
            token.createdAt,
          ],
        }),
        (error) => tokenStorageError('Failed to save token', error)
      ).map(() => undefined);
    },

    findById: (id: string): ResultAsync<ApiToken | null, TokenStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM api_tokens WHERE id = ?`,
          args: [id],
        }),
        (error) => tokenStorageError('Failed to find token', error)
      ).map((result) => {
        const row = result.rows[0] as TokenRow | undefined;
        return row ? rowToToken(row) : null;
      });
    },

    findByUserId: (userId: string): ResultAsync<ApiToken[], TokenStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC`,
          args: [userId],
        }),
        (error) => tokenStorageError('Failed to find tokens by user', error)
      ).map((result) => {
        const rows = result.rows as TokenRow[];
        return rows.map(rowToToken);
      });
    },

    findByOrganizationId: (organizationId: string): ResultAsync<ApiToken[], TokenStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM api_tokens WHERE organization_id = ? ORDER BY created_at DESC`,
          args: [organizationId],
        }),
        (error) => tokenStorageError('Failed to find tokens by organization', error)
      ).map((result) => {
        const rows = result.rows as TokenRow[];
        return rows.map(rowToToken);
      });
    },

    updateLastUsed: (id: string, timestamp: string): ResultAsync<void, TokenStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `UPDATE api_tokens SET last_used_at = ? WHERE id = ?`,
          args: [timestamp, id],
        }),
        (error) => tokenStorageError('Failed to update token last used', error)
      ).map(() => undefined);
    },

    delete: (id: string): ResultAsync<void, TokenStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `DELETE FROM api_tokens WHERE id = ?`,
          args: [id],
        }),
        (error) => tokenStorageError('Failed to delete token', error)
      ).map(() => undefined);
    },

    hasAnyTokens: (): ResultAsync<boolean, TokenStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT 1 FROM api_tokens LIMIT 1`,
        }),
        (error) => tokenStorageError('Failed to check for tokens', error)
      ).map((result) => result.rows.length > 0);
    },
  };
};
