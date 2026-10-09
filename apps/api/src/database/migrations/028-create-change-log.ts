import type { Migration } from '../types.js';

/**
 * Change log for tasks and lists (#133).
 *
 * PR 151 (typed Actor) is not merged yet, so actor_user_id / actor_kind are
 * nullable and stay null until that slots in. project_id is always null until
 * projects (#134+) exist; #138 and #145 will fill it from the subject's project
 * at the time of the change.
 *
 * last_changed_* / completed_by live on the task row as a denormalized read
 * model (cheaper than deriving). The change log is the source of truth.
 */
export const migration: Migration = {
  version: 28,
  name: 'create_change_log',
  up: async (db) => {
    await db.execute({
      sql: `
        CREATE TABLE change_log (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          project_id TEXT,
          subject_type TEXT NOT NULL CHECK (subject_type IN ('task', 'list')),
          subject_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          actor_user_id TEXT,
          actor_kind TEXT CHECK (actor_kind IS NULL OR actor_kind IN ('user', 'bot')),
          occurred_at TEXT NOT NULL,
          hidden INTEGER NOT NULL CHECK (hidden IN (0, 1)),
          FOREIGN KEY (organization_id) REFERENCES organizations(id)
        )
      `,
    });

    await db.execute({
      sql: `
        CREATE INDEX idx_change_log_subject
        ON change_log (subject_type, subject_id, occurred_at)
      `,
    });

    await db.execute({
      sql: `
        CREATE INDEX idx_change_log_org
        ON change_log (organization_id, occurred_at)
      `,
    });

    await db.execute({
      sql: `
        CREATE INDEX idx_change_log_org_project
        ON change_log (organization_id, project_id, occurred_at)
      `,
    });

    await db.execute({
      sql: `ALTER TABLE tasks ADD COLUMN last_changed_at TEXT`,
    });
    await db.execute({
      sql: `ALTER TABLE tasks ADD COLUMN last_changed_by TEXT`,
    });
    await db.execute({
      sql: `ALTER TABLE tasks ADD COLUMN completed_by TEXT`,
    });
  },
};
