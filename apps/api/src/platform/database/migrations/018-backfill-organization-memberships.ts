import type { Migration } from '../types.js';

/**
 * Backfills organization_memberships for existing users who don't have any.
 *
 * This is part of the expand-migrate-contract pattern for transitioning from
 * users.organization_id to the organization_memberships table.
 *
 * For each user without any memberships:
 * - Creates a membership in their organization_id
 * - Sets role to 'owner' (existing users own their org)
 * - Sets is_personal_org to true (treat as personal org)
 * - Uses their created_at as joined_at
 *
 * This migration is idempotent - users who already have memberships are skipped.
 */
export const migration: Migration = {
  version: 18,
  name: 'backfill_organization_memberships',
  up: async (db) => {
    // Generate UUIDs using SQLite's randomblob function
    // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (UUID v4)
    await db.execute({
      sql: `
        INSERT INTO organization_memberships (id, user_id, organization_id, role, is_personal_org, joined_at)
        SELECT 
          lower(
            hex(randomblob(4)) || '-' || 
            hex(randomblob(2)) || '-4' || 
            substr(hex(randomblob(2)), 2) || '-' || 
            substr('89ab', abs(random()) % 4 + 1, 1) || 
            substr(hex(randomblob(2)), 2) || '-' || 
            hex(randomblob(6))
          ),
          id,
          organization_id,
          'owner',
          1,
          created_at
        FROM users
        WHERE NOT EXISTS (
          SELECT 1 FROM organization_memberships om 
          WHERE om.user_id = users.id
        )
      `,
    });
  },
};
