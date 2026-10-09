import type { Migration } from '../types.js';
import { rebuildTable } from '../table-rebuild.js';

/**
 * Expand: token names are optional (empty or colliding names become
 * unnamed) and unique per organization after trim, compared
 * case-insensitively among active tokens. Revoke is a soft delete.
 */
export const migration: Migration = {
  version: 27,
  name: 'nullable_named_tokens',
  up: async (db) => {
    await rebuildTable(db, {
      tableName: 'api_tokens',
      newSchema: `
        CREATE TABLE api_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          name TEXT,
          last_used_at TEXT,
          created_at TEXT NOT NULL,
          organization_id TEXT,
          revoked_at TEXT
        )
      `,
      columnMapping: `SELECT id, user_id, token_hash,
        CASE
          WHEN name IS NULL OR TRIM(name) = '' THEN NULL
          WHEN ROW_NUMBER() OVER (
            PARTITION BY organization_id,
              CASE
                WHEN name IS NULL OR TRIM(name) = '' THEN NULL
                ELSE lower(TRIM(name))
              END
            ORDER BY created_at ASC, id ASC
          ) > 1 THEN NULL
          ELSE TRIM(name)
        END as name,
        last_used_at, created_at, organization_id, NULL as revoked_at`,
      indexes: [
        `CREATE INDEX idx_api_tokens_user ON api_tokens(user_id)`,
        `CREATE INDEX idx_api_tokens_org ON api_tokens(organization_id)`,
        `CREATE UNIQUE INDEX idx_api_tokens_org_name_ci ON api_tokens(organization_id, lower(name)) WHERE name IS NOT NULL AND revoked_at IS NULL`,
      ],
    });
  },
};
