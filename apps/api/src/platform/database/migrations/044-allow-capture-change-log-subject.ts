import type { Migration } from '../types.js';
import { rebuildTable } from '../table-rebuild.js';

/**
 * Lets change_log.subject_type be 'capture' beside task, list, project, and
 * note. SQLite cannot alter a CHECK, so the table is rebuilt. Every column,
 * including seq, is copied. The five indexes are recreated, including the
 * unique seq index. The organization foreign key and the actor_kind and
 * hidden checks stay. change_log has no triggers.
 */
export const migration: Migration = {
  version: 44,
  name: 'allow_capture_change_log_subject',
  owner: 'history',
  up: async (db) => {
    await rebuildTable(db, {
      tableName: 'change_log',
      newSchema: `
        CREATE TABLE change_log (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          project_id TEXT,
          subject_type TEXT NOT NULL CHECK (
            subject_type IN ('task', 'list', 'project', 'note', 'capture')
          ),
          subject_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          actor_user_id TEXT,
          actor_kind TEXT CHECK (actor_kind IS NULL OR actor_kind IN ('user', 'bot')),
          occurred_at TEXT NOT NULL,
          hidden INTEGER NOT NULL CHECK (hidden IN (0, 1)),
          seq INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (organization_id) REFERENCES organizations(id)
        )
      `,
      columnMapping: `
        SELECT
          id, organization_id, project_id, subject_type, subject_id,
          kind, schema_version, payload_json, actor_user_id, actor_kind,
          occurred_at, hidden, seq
      `,
      indexes: [
        `
          CREATE INDEX idx_change_log_subject
          ON change_log (subject_type, subject_id, occurred_at)
        `,
        `
          CREATE INDEX idx_change_log_org
          ON change_log (organization_id, occurred_at)
        `,
        `
          CREATE INDEX idx_change_log_org_project
          ON change_log (organization_id, project_id, occurred_at)
        `,
        `
          CREATE INDEX idx_change_log_org_project_visible
          ON change_log (organization_id, project_id, hidden, occurred_at, seq)
        `,
        `CREATE UNIQUE INDEX idx_change_log_seq ON change_log (seq)`,
      ],
    });
  },
};
