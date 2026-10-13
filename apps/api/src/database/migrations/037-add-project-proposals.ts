import type { Migration } from '../types.js';
import { rebuildTable } from '../table-rebuild.js';

/**
 * Bot proposals (#148): declined status, proposal fields, and a partial
 * unique name index so a turned-down proposal frees its name.
 */
export const migration: Migration = {
  version: 37,
  name: 'add_project_proposals',
  up: async (db) => {
    await rebuildTable(db, {
      tableName: 'projects',
      newSchema: `
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          created_by_id TEXT NOT NULL,
          name TEXT NOT NULL,
          objective TEXT,
          status TEXT NOT NULL CHECK (
            status IN ('active', 'waiting', 'someday', 'done', 'proposed', 'declined')
          ),
          created_at TEXT NOT NULL,
          last_changed_at TEXT,
          last_changed_by TEXT,
          waiting_on TEXT,
          waiting_since TEXT,
          next_action_task_id TEXT,
          notebook_pages TEXT NOT NULL DEFAULT '[]',
          reason TEXT,
          suggested_next_action TEXT,
          FOREIGN KEY (organization_id) REFERENCES organizations(id),
          FOREIGN KEY (created_by_id) REFERENCES users(id),
          FOREIGN KEY (next_action_task_id) REFERENCES tasks(id)
        )
      `,
      columnMapping: `
        SELECT
          id,
          organization_id,
          created_by_id,
          name,
          objective,
          status,
          created_at,
          last_changed_at,
          last_changed_by,
          waiting_on,
          waiting_since,
          next_action_task_id,
          notebook_pages,
          NULL,
          NULL
      `,
      indexes: [
        `
          CREATE UNIQUE INDEX idx_projects_org_name_ci
          ON projects (organization_id, lower(name))
          WHERE status != 'declined'
        `,
      ],
    });
  },
};
