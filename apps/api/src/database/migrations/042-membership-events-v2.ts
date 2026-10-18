import type { Migration } from '../types.js';

/**
 * Membership events v2 (#191). Adds MemberRoleChanged, MemberRemoved, and
 * MemberLeft next to OwnershipTransferred. SQLite cannot change a CHECK or
 * NOT NULL in place, so the table is rebuilt in one write batch.
 */
export const migration: Migration = {
  version: 42,
  name: 'membership_events_v2',
  up: async (db) => {
    await db.batch(
      [
        {
          sql: `
            CREATE TABLE membership_events_v2 (
              id TEXT PRIMARY KEY,
              type TEXT NOT NULL CHECK (
                type IN (
                  'OwnershipTransferred',
                  'MemberRoleChanged',
                  'MemberRemoved',
                  'MemberLeft'
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
              )
            )
          `,
        },
        {
          sql: `
            INSERT INTO membership_events_v2 (
              id, type, organization_id, user_id,
              from_user_id, to_user_id, from_role, to_role,
              actor_kind, actor_user_id, occurred_at
            )
            SELECT
              id, type, organization_id, to_user_id,
              from_user_id, to_user_id, NULL, NULL,
              'member', actor_user_id, occurred_at
            FROM membership_events
          `,
        },
        {
          sql: `DROP TABLE membership_events`,
        },
        {
          sql: `ALTER TABLE membership_events_v2 RENAME TO membership_events`,
        },
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
