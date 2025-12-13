import { DatabaseSync } from 'node:sqlite';
import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type {
  CaptureStore,
  FindByOrganizationOptions,
  FindByOrganizationResult,
} from '../domain/capture-store.js';
import { storageError, type StorageError } from '../domain/capture-errors.js';

export type SqliteCaptureStoreOptions = {
  location: string;
};

type CaptureRow = {
  id: string;
  organization_id: string;
  created_by_id: string;
  content: string;
  title: string | null;
  source_url: string | null;
  source_app: string | null;
  status: string;
  captured_at: string;
  archived_at: string | null;
};

const rowToCapture = (row: CaptureRow): Capture => ({
  id: row.id,
  organizationId: row.organization_id,
  createdById: row.created_by_id,
  content: row.content,
  title: row.title ?? undefined,
  sourceUrl: row.source_url ?? undefined,
  sourceApp: row.source_app ?? undefined,
  status: row.status as 'inbox' | 'archived',
  capturedAt: row.captured_at,
  archivedAt: row.archived_at ?? undefined,
});

const initialize = (db: DatabaseSync): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      created_by_id TEXT NOT NULL,
      content TEXT NOT NULL,
      title TEXT,
      source_url TEXT,
      source_app TEXT,
      status TEXT NOT NULL DEFAULT 'inbox',
      captured_at TEXT NOT NULL,
      archived_at TEXT
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_captures_org_status
    ON captures(organization_id, status, captured_at DESC)
  `);
};

export const createSqliteCaptureStore = (
  options: SqliteCaptureStoreOptions
): CaptureStore => {
  const db = new DatabaseSync(options.location);
  initialize(db);

  return {
    save: (capture: Capture): ResultAsync<void, StorageError> => {
      try {
        const stmt = db.prepare(`
          INSERT INTO captures (
            id, organization_id, created_by_id, content, title,
            source_url, source_app, status, captured_at, archived_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          capture.id,
          capture.organizationId,
          capture.createdById,
          capture.content,
          capture.title ?? null,
          capture.sourceUrl ?? null,
          capture.sourceApp ?? null,
          capture.status,
          capture.capturedAt,
          capture.archivedAt ?? null
        );

        return okAsync(undefined);
      } catch (error) {
        return errAsync(storageError('Failed to save capture', error));
      }
    },

    findByOrganization: (
      options: FindByOrganizationOptions
    ): ResultAsync<FindByOrganizationResult, StorageError> => {
      try {
        const { organizationId, status, limit = 50 } = options;

        let sql = `
          SELECT * FROM captures
          WHERE organization_id = ?
        `;
        const params: (string | number)[] = [organizationId];

        if (status) {
          sql += ` AND status = ?`;
          params.push(status);
        }

        sql += ` ORDER BY captured_at DESC LIMIT ?`;
        params.push(limit);

        const stmt = db.prepare(sql);
        const rows = stmt.all(...params) as CaptureRow[];

        const captures = rows.map(rowToCapture);

        return okAsync({ captures });
      } catch (error) {
        return errAsync(storageError('Failed to find captures', error));
      }
    },
  };
};
