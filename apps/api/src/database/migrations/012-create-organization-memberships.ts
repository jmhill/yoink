import type { Migration } from '../types.js';

/**
 * Creates the organization_memberships table to support multi-org membership.
 *
 * This replaces the implicit user->org relationship (users.organization_id)
 * with an explicit many-to-many relationship via this join table.
 *
 * Key design decisions:
 * - is_personal_org: true for user's auto-created personal org (cannot leave)
 * - role: owner (personal org), admin, or member
 * - Composite unique constraint prevents duplicate memberships
 */
export const migration: Migration = {
  version: 12,
  name: 'create_organization_memberships',
  up: async (db) => {
    await db.execute({
      sql: `
        CREATE TABLE organization_memberships (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
          is_personal_org INTEGER NOT NULL DEFAULT 0,
          joined_at TEXT NOT NULL,
          UNIQUE(user_id, organization_id)
        )
      `,
    });

    // Index for listing organizations a user belongs to
    await db.execute({
      sql: `CREATE INDEX idx_memberships_user ON organization_memberships(user_id)`,
    });

    // Index for listing members of an organization
    await db.execute({
      sql: `CREATE INDEX idx_memberships_org ON organization_memberships(organization_id)`,
    });
  },
};
