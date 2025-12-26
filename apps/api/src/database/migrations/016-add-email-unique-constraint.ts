import type { Migration } from '../types.js';
import { rebuildTable } from '../table-rebuild.js';

/**
 * Adds a UNIQUE constraint on users.email for global email uniqueness.
 *
 * Previously, emails were only unique per-organization (implicit, not enforced).
 * With multi-org membership, a user's email must be globally unique since
 * users can belong to multiple organizations.
 *
 * This uses a table rebuild since SQLite doesn't support adding constraints
 * to existing tables.
 *
 * Note: This migration will fail if there are duplicate emails across
 * organizations. If that's the case, a data migration will be needed first.
 */
export const migration: Migration = {
  version: 16,
  name: 'add_email_unique_constraint',
  up: (db) => {
    rebuildTable(db, {
      tableName: 'users',
      newSchema: `
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        )
      `,
      columnMapping: 'SELECT id, organization_id, email, created_at',
      indexes: [
        'CREATE INDEX idx_users_organization ON users(organization_id)',
      ],
    });
  },
};
