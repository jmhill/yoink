import type { Migration } from '../types.js';

/**
 * Project next action (#137): at most one open task marked as the
 * project's next action. Nullable circular FK with tasks.project_id —
 * both sides stay nullable. Rebuild both tables if we ever need a
 * stricter constraint or ON DELETE behavior.
 */
export const migration: Migration = {
  version: 32,
  name: 'add_project_next_action',
  up: async (db) => {
    await db.batch(
      [
        {
          sql: `ALTER TABLE projects ADD COLUMN next_action_task_id TEXT REFERENCES tasks(id)`,
        },
      ],
      'write'
    );
  },
};
