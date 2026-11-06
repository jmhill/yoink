import type { Migration } from '../types.js';

/**
 * Membership events (#190). First event is OwnershipTransferred.
 */
export const migration: Migration = {
  version: 41,
  name: 'membership_events',
  up: async (db) => {
    await db.batch(
      [
        {
          sql: `
            CREATE TABLE membership_events (
              id TEXT PRIMARY KEY,
              type TEXT NOT NULL CHECK (type IN ('OwnershipTransferred')),
              organization_id TEXT NOT NULL,
              from_user_id TEXT NOT NULL,
              to_user_id TEXT NOT NULL,
              actor_user_id TEXT NOT NULL,
              occurred_at TEXT NOT NULL,
              FOREIGN KEY (organization_id) REFERENCES organizations(id)
            )
          `,
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
