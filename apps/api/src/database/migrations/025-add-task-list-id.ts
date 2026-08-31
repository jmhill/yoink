import type { Migration } from '../types.js';

/**
 * Adds an optional list bucket on tasks (one list or none, not tags).
 */
export const migration: Migration = {
  version: 25,
  name: 'add_task_list_id',
  up: async (db) => {
    await db.execute({
      sql: `ALTER TABLE tasks ADD COLUMN list_id TEXT REFERENCES lists(id)`,
    });
    await db.execute({
      sql: `CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(organization_id, list_id)`,
    });
  },
};
