import type { Migration } from '../types.js';
import { rebuildTable } from '../table-rebuild.js';

/**
 * M5.9: `project_notes.project_id` stays an opaque id. The projects foreign
 * key from migration 036 is gone. Both notes indexes stay. Organization and
 * user foreign keys stay identity anchors. This is version 048. 046 is merged
 * (#382) and 047 is Done (#383, #387). `rebuildTable` uses `Database.migrate`.
 */
export const migration: Migration = {
  version: 48,
  name: 'drop_project_notes_project_foreign_key',
  owner: 'notes',
  up: async (db) => {
    await rebuildTable(db, {
      tableName: 'project_notes',
      newSchema: `
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
          FOREIGN KEY (created_by) REFERENCES users(id),
          FOREIGN KEY (updated_by) REFERENCES users(id)
        )
      `,
      columnMapping: `
        SELECT
          id, organization_id, project_id, title, body, version,
          created_at, created_by, updated_at, updated_by, deleted_at
      `,
      indexes: [
        `
          CREATE INDEX idx_project_notes_org_project_updated
          ON project_notes (organization_id, project_id, updated_at)
        `,
        `
          CREATE INDEX idx_project_notes_org_updated_id
          ON project_notes (organization_id, updated_at, id)
        `,
      ],
    });
  },
};
