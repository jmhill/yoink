import type { Migration } from '../types.js';

/**
 * Adds an optional assignee (principal id: human or agent) to tasks.
 * This is a field, not an assignment product.
 */
export const migration: Migration = {
  version: 22,
  name: 'add_task_assignee',
  up: async (db) => {
    await db.execute({
      sql: `ALTER TABLE tasks ADD COLUMN assignee_id TEXT`,
    });
    await db.execute({
      sql: `CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(organization_id, assignee_id)`,
    });
  },
};
