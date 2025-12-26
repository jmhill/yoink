import type { Migration } from '../types.js';

/**
 * Creates the invitations table for invitation-only signup.
 *
 * Key design decisions:
 * - code: Short, unique code for sharing (e.g., 8 alphanumeric chars)
 * - email: Optional restriction to specific email address
 * - role: The role the invitee will get when joining the org
 * - expires_at: Invitations have a TTL (default 7 days)
 * - accepted_at/accepted_by_user_id: Track when/who used the invitation
 */
export const migration: Migration = {
  version: 13,
  name: 'create_invitations',
  up: (db) => {
    db.exec(`
      CREATE TABLE invitations (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        email TEXT,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        invited_by_user_id TEXT NOT NULL REFERENCES users(id),
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
        expires_at TEXT NOT NULL,
        accepted_at TEXT,
        accepted_by_user_id TEXT REFERENCES users(id),
        created_at TEXT NOT NULL
      )
    `);

    // Index for looking up invitation by code (primary lookup method)
    db.exec(`CREATE UNIQUE INDEX idx_invitations_code ON invitations(code)`);

    // Index for listing pending invitations by organization
    db.exec(`CREATE INDEX idx_invitations_org ON invitations(organization_id, accepted_at)`);
  },
};
