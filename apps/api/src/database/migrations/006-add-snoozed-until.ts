import type { Migration } from '../types.js';

export const migration: Migration = {
  version: 6,
  name: 'add_snoozed_until_to_captures',
  up: async (db) => {
    // Add snoozed_until column to captures table
    // This column stores when a snooze expires (ISO datetime string)
    // A capture is considered snoozed when snoozed_until > current time
    await db.execute({ sql: `ALTER TABLE captures ADD COLUMN snoozed_until TEXT` });

    // Create an index for efficient querying of snoozed captures
    // This helps when filtering inbox captures to exclude/include snoozed ones
    await db.execute({
      sql: `
        CREATE INDEX idx_captures_snoozed 
        ON captures(organization_id, status, snoozed_until)
      `,
    });
  },
};
