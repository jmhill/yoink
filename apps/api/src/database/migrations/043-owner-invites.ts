import type { Migration } from '../types.js';

/**
 * Owner invites (#186). Rebuilds invitations (owner role, replaced_at,
 * one-live-owner unique index) and membership_events (OwnerAssigned)
 * in one write batch.
 */
export const migration: Migration = {
  version: 43,
  name: 'owner_invites',
  up: async (db) => {
    await db.batch(
      [
        {
          sql: `
            CREATE TABLE invitations_new (
              id TEXT PRIMARY KEY,
              code TEXT NOT NULL UNIQUE,
              email TEXT,
              organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
              invited_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
              role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
              expires_at TEXT NOT NULL,
              accepted_at TEXT,
              accepted_by_user_id TEXT REFERENCES users(id),
              replaced_at TEXT,
              created_at TEXT NOT NULL,
              CHECK (role <> 'owner' OR invited_by_user_id IS NULL),
              CHECK (role <> 'owner' OR email IS NOT NULL)
            )
          `,
        },
        {
          sql: `
            INSERT INTO invitations_new (
              id, code, email, organization_id, invited_by_user_id,
              role, expires_at, accepted_at, accepted_by_user_id,
              replaced_at, created_at
            )
            SELECT
              id, code, email, organization_id, invited_by_user_id,
              role, expires_at, accepted_at, accepted_by_user_id,
              NULL, created_at
            FROM invitations
          `,
        },
        { sql: `DROP TABLE invitations` },
        { sql: `ALTER TABLE invitations_new RENAME TO invitations` },
        {
          sql: `CREATE UNIQUE INDEX idx_invitations_code ON invitations(code)`,
        },
        {
          sql: `CREATE INDEX idx_invitations_org ON invitations(organization_id, accepted_at)`,
        },
        {
          sql: `
            CREATE UNIQUE INDEX idx_invitations_one_live_owner
            ON invitations(organization_id)
            WHERE role = 'owner' AND accepted_at IS NULL AND replaced_at IS NULL
          `,
        },
        {
          sql: `
            CREATE TABLE membership_events_v3 (
              id TEXT PRIMARY KEY,
              type TEXT NOT NULL CHECK (
                type IN (
                  'OwnershipTransferred',
                  'MemberRoleChanged',
                  'MemberRemoved',
                  'MemberLeft',
                  'OwnerAssigned'
                )
              ),
              organization_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              from_user_id TEXT,
              to_user_id TEXT,
              from_role TEXT CHECK (
                from_role IS NULL OR from_role IN ('owner', 'admin', 'member')
              ),
              to_role TEXT CHECK (
                to_role IS NULL OR to_role IN ('owner', 'admin', 'member')
              ),
              actor_kind TEXT NOT NULL CHECK (actor_kind IN ('member', 'app-admin', 'self')),
              actor_user_id TEXT,
              occurred_at TEXT NOT NULL,
              FOREIGN KEY (organization_id) REFERENCES organizations(id),
              CHECK (
                (actor_kind = 'app-admin' AND actor_user_id IS NULL)
                OR (actor_kind <> 'app-admin' AND actor_user_id IS NOT NULL)
              ),
              CHECK (
                type <> 'OwnershipTransferred'
                OR (
                  from_user_id IS NOT NULL
                  AND to_user_id IS NOT NULL
                  AND from_role IS NULL
                  AND to_role IS NULL
                  AND actor_kind = 'member'
                  AND user_id = to_user_id
                )
              ),
              CHECK (
                type <> 'MemberRoleChanged'
                OR (
                  from_role IS NOT NULL
                  AND to_role IS NOT NULL
                  AND from_user_id IS NULL
                  AND to_user_id IS NULL
                  AND (
                    (actor_kind = 'member' AND actor_user_id IS NOT NULL)
                    OR (actor_kind = 'app-admin' AND actor_user_id IS NULL)
                  )
                )
              ),
              CHECK (
                type <> 'MemberRemoved'
                OR (
                  from_role IS NOT NULL
                  AND to_role IS NULL
                  AND from_user_id IS NULL
                  AND to_user_id IS NULL
                  AND actor_kind = 'member'
                  AND actor_user_id IS NOT NULL
                )
              ),
              CHECK (
                type <> 'MemberLeft'
                OR (
                  from_role IS NOT NULL
                  AND to_role IS NULL
                  AND from_user_id IS NULL
                  AND to_user_id IS NULL
                  AND actor_kind = 'self'
                  AND actor_user_id IS NOT NULL
                )
              ),
              CHECK (
                type <> 'OwnerAssigned'
                OR (
                  to_role = 'owner'
                  AND (from_role IN ('admin', 'member') OR from_role IS NULL)
                  AND to_user_id IS NULL
                  AND actor_kind IN ('app-admin', 'self')
                  AND (
                    (actor_kind = 'app-admin' AND actor_user_id IS NULL)
                    OR (actor_kind = 'self' AND actor_user_id = user_id)
                  )
                )
              )
            )
          `,
        },
        {
          sql: `
            INSERT INTO membership_events_v3 (
              id, type, organization_id, user_id,
              from_user_id, to_user_id, from_role, to_role,
              actor_kind, actor_user_id, occurred_at
            )
            SELECT
              id, type, organization_id, user_id,
              from_user_id, to_user_id, from_role, to_role,
              actor_kind, actor_user_id, occurred_at
            FROM membership_events
          `,
        },
        { sql: `DROP TABLE membership_events` },
        { sql: `ALTER TABLE membership_events_v3 RENAME TO membership_events` },
        {
          sql: `
            CREATE INDEX idx_membership_events_org
            ON membership_events (organization_id, occurred_at)
          `,
        },
      ],
      'write'
    );
  },
};
