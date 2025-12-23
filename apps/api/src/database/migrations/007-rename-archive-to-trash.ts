import type { Migration } from '../types.js';
import { rebuildTable } from '../table-rebuild.js';

export const migration: Migration = {
  version: 7,
  name: 'rename_archive_to_trash',
  up: (db) => {
    // Rebuild captures table to:
    // 1. Rename archived_at column to trashed_at
    // 2. Update status values from 'archived' to 'trashed'
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
          pinned_at TEXT,
          snoozed_until TEXT
        )
      `,
      // Map archived_at to trashed_at, convert 'archived' status to 'trashed'
      columnMapping: `
        SELECT 
          id,
          organization_id,
          created_by_id,
          content,
          title,
          source_url,
          source_app,
          CASE WHEN status = 'archived' THEN 'trashed' ELSE status END as status,
          captured_at,
          archived_at as trashed_at,
          pinned_at,
          snoozed_until
      `,
      indexes: [
        `CREATE INDEX idx_captures_org_status ON captures(organization_id, status, captured_at DESC)`,
        `CREATE INDEX idx_captures_pinned ON captures(organization_id, status, pinned_at)`,
        `CREATE INDEX idx_captures_snoozed ON captures(organization_id, status, snoozed_until)`,
      ],
    });
  },
};
