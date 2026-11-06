import type { Migration } from '../types.js';

/**
 * Expand: unique list name per organization, compared case-insensitively
 * after trim (names are stored trimmed).
 *
 * The existing idx_lists_org_name index stays (contract drop later).
 */
export const migration: Migration = {
  version: 24,
  name: 'unique_list_name_per_org',
  up: async (db) => {
    await db.execute({
      sql: `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_lists_org_name_ci
        ON lists(organization_id, lower(name))
      `,
    });
  },
};
