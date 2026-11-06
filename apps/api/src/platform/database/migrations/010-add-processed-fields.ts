import type { Migration } from '../types.js';

export const migration: Migration = {
  version: 10,
  name: 'add_processed_fields',
  up: async (db) => {
    // Add processed_at column to track when a capture was processed into a task/note
    await db.execute({ sql: `ALTER TABLE captures ADD COLUMN processed_at TEXT` });

    // Add processed_to_type column to track what type of entity the capture became
    // Values: 'task' | 'note' | null
    await db.execute({ sql: `ALTER TABLE captures ADD COLUMN processed_to_type TEXT` });

    // Add processed_to_id column to reference the created entity
    await db.execute({ sql: `ALTER TABLE captures ADD COLUMN processed_to_id TEXT` });

    // Add index for querying processed captures
    await db.execute({
      sql: `CREATE INDEX idx_captures_processed ON captures(organization_id, processed_at)`,
    });
  },
};
