import type { Migration } from '../types.js';
import { rebuildTable } from '../table-rebuild.js';

/**
 * Makes invited_by_user_id nullable in the invitations table.
 *
 * This is needed to support admin-created invitations where there is no
 * specific user who created the invitation. Previously, the column had
 * a NOT NULL constraint and a foreign key to users(id), which prevented
 * admin-created invitations from working.
 *
 * Changes:
 * - invited_by_user_id: TEXT NOT NULL REFERENCES users(id) -> TEXT (nullable, no FK)
 */
export const migration: Migration = {
  version: 17,
  name: 'make_invitation_invited_by_nullable',
  up: async (db) => {
    await rebuildTable(db, {
      tableName: 'invitations',
      newSchema: `
        CREATE TABLE invitations (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          email TEXT,
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          invited_by_user_id TEXT,
          role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
          expires_at TEXT NOT NULL,
          accepted_at TEXT,
          accepted_by_user_id TEXT REFERENCES users(id),
          created_at TEXT NOT NULL
        )
      `,
      columnMapping: `SELECT id, code, email, organization_id, invited_by_user_id, role, expires_at, accepted_at, accepted_by_user_id, created_at`,
      indexes: [
        `CREATE UNIQUE INDEX idx_invitations_code ON invitations(code)`,
        `CREATE INDEX idx_invitations_org ON invitations(organization_id, accepted_at)`,
      ],
    });
  },
};
