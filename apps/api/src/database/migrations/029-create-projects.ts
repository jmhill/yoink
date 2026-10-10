import type { Migration } from '../types.js';

/**
 * Projects (#134): a dedicated table, unique name per org (case-insensitive),
 * and a rebuilt change_log CHECK so subject_type can be 'project'.
 *
 * Existing change_log rows and indexes are copied/recreated in the same batch.
 */
export const migration: Migration = {
  version: 29,
  name: 'create_projects',
  up: async (db) => {
    await db.batch(
      [
        {
          sql: `
            CREATE TABLE projects (
              id TEXT PRIMARY KEY,
              organization_id TEXT NOT NULL,
              created_by_id TEXT NOT NULL,
              name TEXT NOT NULL,
              objective TEXT,
              status TEXT NOT NULL CHECK (
                status IN ('active', 'waiting', 'someday', 'done', 'proposed')
              ),
              created_at TEXT NOT NULL,
              last_changed_at TEXT,
              last_changed_by TEXT,
              FOREIGN KEY (organization_id) REFERENCES organizations(id),
              FOREIGN KEY (created_by_id) REFERENCES users(id)
            )
          `,
        },
        {
          sql: `
            CREATE UNIQUE INDEX idx_projects_org_name_ci
            ON projects (organization_id, lower(name))
          `,
        },
        {
          sql: `
            CREATE TABLE change_log_new (
              id TEXT PRIMARY KEY,
              organization_id TEXT NOT NULL,
              project_id TEXT,
              subject_type TEXT NOT NULL CHECK (subject_type IN ('task', 'list', 'project')),
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
        },
        {
          sql: `
            INSERT INTO change_log_new (
              id, organization_id, project_id, subject_type, subject_id,
              kind, schema_version, payload_json, actor_user_id, actor_kind,
              occurred_at, hidden
            )
            SELECT
              id, organization_id, project_id, subject_type, subject_id,
              kind, schema_version, payload_json, actor_user_id, actor_kind,
              occurred_at, hidden
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
      ],
      'write'
    );
  },
};
