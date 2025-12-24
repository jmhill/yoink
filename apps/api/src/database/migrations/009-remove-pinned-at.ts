import type { Migration } from '../types.js';
import { rebuildTable } from '../table-rebuild.js';

export const migration: Migration = {
  version: 9,
  name: 'remove_pinned_at',
  up: (db) => {
    // Rebuild captures table to remove pinned_at column
    // Pin functionality has been removed from captures
    rebuildTable(db, {
      tableName: 'captures',
      newSchema: `
        CREATE TABLE captures (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          created_by_id TEXT NOT NULL,
          content TEXT NOT NULL,
          title TEXT,
          source_url TEXT,
          source_app TEXT,
          status TEXT NOT NULL DEFAULT 'inbox',
          captured_at TEXT NOT NULL,
          trashed_at TEXT,
          snoozed_until TEXT,
          deleted_at TEXT
        )
      `,
      columnMapping: `
        SELECT 
          id,
          organization_id,
          created_by_id,
          content,
          title,
          source_url,
          source_app,
          status,
          captured_at,
          trashed_at,
          snoozed_until,
          deleted_at
      `,
      indexes: [
        `CREATE INDEX idx_captures_org_status ON captures(organization_id, status, captured_at DESC)`,
        `CREATE INDEX idx_captures_snoozed ON captures(organization_id, status, snoozed_until)`,
        `CREATE INDEX idx_captures_deleted ON captures(deleted_at)`,
      ],
    });
  },
};
