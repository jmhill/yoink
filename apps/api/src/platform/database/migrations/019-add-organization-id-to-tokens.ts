import type { Migration } from '../types.js';

/**
 * Adds organization_id to api_tokens table.
 *
 * This is part of the expand-migrate-contract pattern. Tokens will now be
 * scoped to organizations instead of deriving the org from the user's
 * organization_id field.
 *
 * The column is added as nullable initially, backfilled from users.organization_id,
 * then we trust the backfill handled all existing tokens.
 */
export const migration: Migration = {
  version: 19,
  name: 'add_organization_id_to_tokens',
  up: async (db) => {
    // Add nullable column
    await db.execute({
      sql: `ALTER TABLE api_tokens ADD COLUMN organization_id TEXT`,
    });

    // Backfill from users table
    await db.execute({
      sql: `
        UPDATE api_tokens 
        SET organization_id = (
          SELECT organization_id FROM users WHERE users.id = api_tokens.user_id
        )
      `,
    });

    // Add index for listing tokens by organization
    await db.execute({
      sql: `CREATE INDEX idx_api_tokens_org ON api_tokens(organization_id)`,
    });
  },
};
