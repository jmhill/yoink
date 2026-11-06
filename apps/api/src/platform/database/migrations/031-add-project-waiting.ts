import type { Migration } from '../types.js';

/**
 * Project status waiting fields (#136): who a project is waiting on,
 * and since when (YYYY-MM-DD, or null when unknown).
 */
export const migration: Migration = {
  version: 31,
  name: 'add_project_waiting',
  up: async (db) => {
    await db.batch(
      [
        { sql: `ALTER TABLE projects ADD COLUMN waiting_on TEXT` },
        { sql: `ALTER TABLE projects ADD COLUMN waiting_since TEXT` },
      ],
      'write'
    );
  },
};
