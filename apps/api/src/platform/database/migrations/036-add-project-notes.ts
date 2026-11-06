import type { Migration } from '../types.js';

/**
 * Project notes (#147): in-app notes on a project, opaque versions, soft
 * delete, and a rebuilt change_log CHECK so subject_type can be 'note'.
 *
 * Existing change_log rows, seq, and indexes are copied/recreated in the
 * same batch.
 */
export const migration: Migration = {
  version: 36,
  name: 'add_project_notes',
  up: async (db) => {
    await db.batch(
      [
        {
          sql: `
            CREATE TABLE project_notes (
              id TEXT PRIMARY KEY,
              organization_id TEXT NOT NULL,
              project_id TEXT NOT NULL,
              title TEXT NOT NULL,
              body TEXT NOT NULL DEFAULT '',
              version TEXT NOT NULL,
              created_at TEXT NOT NULL,
              created_by TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              updated_by TEXT NOT NULL,
              deleted_at TEXT,
              FOREIGN KEY (organization_id) REFERENCES organizations(id),
              FOREIGN KEY (project_id) REFERENCES projects(id),
              FOREIGN KEY (created_by) REFERENCES users(id),
              FOREIGN KEY (updated_by) REFERENCES users(id)
            )
          `,
        },
        {
          sql: `
            CREATE INDEX idx_project_notes_org_project_updated
            ON project_notes (organization_id, project_id, updated_at)
          `,
        },
        {
          sql: `
            CREATE TABLE change_log_new (
              id TEXT PRIMARY KEY,
              organization_id TEXT NOT NULL,
              project_id TEXT,
              subject_type TEXT NOT NULL CHECK (
                subject_type IN ('task', 'list', 'project', 'note')
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
        },
        {
          sql: `
            INSERT INTO change_log_new (
              id, organization_id, project_id, subject_type, subject_id,
              kind, schema_version, payload_json, actor_user_id, actor_kind,
              occurred_at, hidden, seq
            )
            SELECT
              id, organization_id, project_id, subject_type, subject_id,
              kind, schema_version, payload_json, actor_user_id, actor_kind,
              occurred_at, hidden, seq
            FROM change_log
          `,
        },
        { sql: `DROP TABLE change_log` },
        { sql: `ALTER TABLE change_log_new RENAME TO change_log` },
        {
          sql: `
            CREATE INDEX idx_change_log_subject
            ON change_log (subject_type, subject_id, occurred_at)
          `,
        },
        {
          sql: `
            CREATE INDEX idx_change_log_org
            ON change_log (organization_id, occurred_at)
          `,
        },
        {
          sql: `
            CREATE INDEX idx_change_log_org_project
            ON change_log (organization_id, project_id, occurred_at)
          `,
        },
        {
          sql: `
            CREATE INDEX idx_change_log_org_project_visible
            ON change_log (organization_id, project_id, hidden, occurred_at, seq)
          `,
        },
        {
          sql: `CREATE UNIQUE INDEX idx_change_log_seq ON change_log (seq)`,
        },
      ],
      'write'
    );
  },
};
