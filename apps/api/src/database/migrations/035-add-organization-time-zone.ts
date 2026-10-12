import type { Migration } from '../types.js';

/**
 * Review done list (#146): stored org time zone so a week is Monday–Sunday
 * in Justin's zone. Default America/Chicago. No edit UI in this story.
 */
export const migration: Migration = {
  version: 35,
  name: 'add_organization_time_zone',
  up: async (db) => {
    await db.execute({
      sql: `ALTER TABLE organizations ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'America/Chicago'`,
    });
  },
};
