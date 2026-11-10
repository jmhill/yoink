import type { Migration } from '../types.js';
import { rebuildTable } from '../table-rebuild.js';

/**
 * M5.6: `tasks.capture_id` stays an opaque id. The captures foreign key from
 * migration 011 is gone. `idx_tasks_capture` stays. List and project foreign
 * keys stay inside task-management. Organization and user foreign keys stay
 * identity anchors.
 */
export const migration: Migration = {
  version: 46,
  name: 'drop_task_capture_foreign_key',
  owner: 'task-management',
  up: async (db) => {
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
          open_order INTEGER,
          last_changed_at TEXT,
          last_changed_by TEXT,
          completed_by TEXT,
          project_id TEXT,
          FOREIGN KEY (organization_id) REFERENCES organizations(id),
          FOREIGN KEY (created_by_id) REFERENCES users(id),
          FOREIGN KEY (list_id) REFERENCES lists(id),
          FOREIGN KEY (project_id) REFERENCES projects(id)
        )
      `,
      columnMapping: `
        SELECT
          id,
          organization_id,
          created_by_id,
          title,
          capture_id,
          due_date,
          completed_at,
          pinned_at,
          created_at,
          deleted_at,
          assignee_id,
          list_id,
          open_order,
          last_changed_at,
          last_changed_by,
          completed_by,
          project_id
      `,
      indexes: [
        `
          CREATE INDEX idx_tasks_org_list ON tasks(
            organization_id,
            deleted_at,
            pinned_at DESC,
            created_at DESC
          )
        `,
        `
          CREATE INDEX idx_tasks_due_date ON tasks(
            organization_id,
            deleted_at,
            due_date
          )
        `,
        `
          CREATE INDEX idx_tasks_completed ON tasks(
            organization_id,
            deleted_at,
            completed_at
          )
        `,
        `CREATE INDEX idx_tasks_capture ON tasks(capture_id)`,
        `CREATE INDEX idx_tasks_assignee ON tasks(organization_id, assignee_id)`,
        `CREATE INDEX idx_tasks_list ON tasks(organization_id, list_id)`,
        `
          CREATE INDEX idx_tasks_open_order
          ON tasks(organization_id, list_id, open_order)
        `,
        `
          CREATE INDEX idx_tasks_project
          ON tasks (organization_id, project_id, completed_at, created_at)
        `,
      ],
    });
  },
};
