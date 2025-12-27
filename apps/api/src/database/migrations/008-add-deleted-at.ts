import type { Migration } from '../types.js';

export const migration: Migration = {
  version: 8,
  name: 'add_deleted_at',
  up: async (db) => {
    // Add deleted_at column to captures table for soft-delete functionality
    // Items with deleted_at set are permanently deleted (hidden from all queries)
    await db.execute({
      sql: `
        ALTER TABLE captures
        ADD COLUMN deleted_at TEXT
      `,
    });
  },
};
