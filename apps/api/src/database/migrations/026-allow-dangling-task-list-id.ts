import type { Migration } from '../types.js';
import { rebuildTable } from '../table-rebuild.js';

/**
 * Drop the tasks.list_id foreign key to lists(id).
 *
 * Deleting a named list must leave completed tasks' stored listId in place
 * (do not cascade-delete, do not auto-unlist). SQLite's default FK action
 * would refuse the delete while any task still points at the list.
 *
 * After this, list_id is an ordinary optional uuid. A completed task can
 * keep a dangling id after the list row is gone.
 */
export const migration: Migration = {
  version: 26,
  name: 'allow_dangling_task_list_id',
  up: async (db) => {
    await db.execute({
      sql: `DROP TABLE IF EXISTS tasks_new`,
    });

    await rebuildTable(db, {
      tableName: 'tasks',
      newSchema: `
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          created_by_id TEXT NOT NULL,
          title TEXT NOT NULL,
          capture_id TEXT,
          due_date TEXT,
          completed_at TEXT,
          pinned_at TEXT,
          created_at TEXT NOT NULL,
          deleted_at TEXT,
          assignee_id TEXT,
          list_id TEXT,
          FOREIGN KEY (organization_id) REFERENCES organizations(id),
          FOREIGN KEY (created_by_id) REFERENCES users(id),
          FOREIGN KEY (capture_id) REFERENCES captures(id)
        )
      `,
      columnMapping:
        'SELECT id, organization_id, created_by_id, title, capture_id, due_date, completed_at, pinned_at, created_at, deleted_at, assignee_id, list_id',
      indexes: [
        `CREATE INDEX idx_tasks_org_list ON tasks(
          organization_id,
          deleted_at,
          pinned_at DESC,
          created_at DESC
        )`,
        `CREATE INDEX idx_tasks_due_date ON tasks(
          organization_id,
          deleted_at,
          due_date
        )`,
        `CREATE INDEX idx_tasks_completed ON tasks(
          organization_id,
          deleted_at,
          completed_at
        )`,
        `CREATE INDEX idx_tasks_capture ON tasks(capture_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(organization_id, assignee_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(organization_id, list_id)`,
      ],
    });
  },
};
