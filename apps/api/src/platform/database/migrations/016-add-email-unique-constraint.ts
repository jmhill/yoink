import type { Migration } from '../types.js';

/**
 * Adds a UNIQUE constraint on users.email for global email uniqueness.
 *
 * Previously, emails were only unique per-organization (implicit, not enforced).
 * With multi-org membership, a user's email must be globally unique since
 * users can belong to multiple organizations.
 *
 * This uses a unique index rather than a table rebuild with a UNIQUE column
 * constraint. Both achieve the same result (unique email enforcement), but
 * a unique index is much simpler and doesn't require complex table rebuild
 * logic that can interfere with foreign key references.
 *
 * Note: This migration will fail if there are duplicate emails across
 * organizations. If that's the case, a data migration will be needed first.
 */
export const migration: Migration = {
  version: 16,
  name: 'add_email_unique_constraint',
  up: async (db) => {
    // Use CREATE UNIQUE INDEX instead of table rebuild
    // This achieves the same uniqueness enforcement with much less complexity
    await db.execute({
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email)`,
    });
  },
};
