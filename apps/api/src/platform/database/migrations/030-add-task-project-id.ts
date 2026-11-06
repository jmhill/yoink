import type { Migration } from '../types.js';

/**
 * Adds an optional project on tasks (0 or 1, independent of list).
 * Index supports the project-page open-task list (newest created first).
 */
export const migration: Migration = {
  version: 30,
  name: 'add_task_project_id',
  up: async (db) => {
    await db.batch(
      [
        {
          sql: `ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id)`,
        },
        {
          sql: `
            CREATE INDEX IF NOT EXISTS idx_tasks_project
            ON tasks (organization_id, project_id, completed_at, created_at)
          `,
        },
      ],
      'write'
    );
  },
};
