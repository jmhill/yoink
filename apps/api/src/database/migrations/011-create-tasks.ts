import type { Migration } from '../types.js';

export const migration: Migration = {
  version: 11,
  name: 'create_tasks',
  up: (db) => {
    // Create tasks table
    db.exec(`
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
        FOREIGN KEY (organization_id) REFERENCES organizations(id),
        FOREIGN KEY (created_by_id) REFERENCES users(id),
        FOREIGN KEY (capture_id) REFERENCES captures(id)
      )
    `);

    // Index for listing tasks by organization (most common query)
    // Sort: pinned first (DESC puts non-null before null), then by created_at DESC
    db.exec(`
      CREATE INDEX idx_tasks_org_list ON tasks(
        organization_id,
        deleted_at,
        pinned_at DESC,
        created_at DESC
      )
    `);

    // Index for filtering by due date (today, upcoming views)
    db.exec(`
      CREATE INDEX idx_tasks_due_date ON tasks(
        organization_id,
        deleted_at,
        due_date
      )
    `);

    // Index for filtering by completion status
    db.exec(`
      CREATE INDEX idx_tasks_completed ON tasks(
        organization_id,
        deleted_at,
        completed_at
      )
    `);

    // Index for looking up task by capture_id (for cascade delete)
    db.exec(`
      CREATE INDEX idx_tasks_capture ON tasks(capture_id)
    `);
  },
};
