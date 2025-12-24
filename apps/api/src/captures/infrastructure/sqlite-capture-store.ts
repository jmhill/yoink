import type { DatabaseSync } from 'node:sqlite';
import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { Clock } from '@yoink/infrastructure';
import type {
  CaptureStore,
  FindByOrganizationOptions,
  FindByOrganizationResult,
  MarkAsProcessedOptions,
} from '../domain/capture-store.js';
import { storageError, type StorageError } from '../domain/capture-errors.js';

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
  trashed_at: string | null;
  snoozed_until: string | null;
  processed_at: string | null;
  processed_to_type: string | null;
  processed_to_id: string | null;
};

const rowToCapture = (row: CaptureRow): Capture => ({
  id: row.id,
  organizationId: row.organization_id,
  createdById: row.created_by_id,
  content: row.content,
  title: row.title ?? undefined,
  sourceUrl: row.source_url ?? undefined,
  sourceApp: row.source_app ?? undefined,
  status: row.status as 'inbox' | 'trashed' | 'processed',
  capturedAt: row.captured_at,
  trashedAt: row.trashed_at ?? undefined,
  snoozedUntil: row.snoozed_until ?? undefined,
  processedAt: row.processed_at ?? undefined,
  processedToType: (row.processed_to_type as 'task' | 'note') ?? undefined,
  processedToId: row.processed_to_id ?? undefined,
});

/**
 * Validates that the required database schema exists.
 * Throws an error if migrations have not been run.
 */
const validateSchema = (db: DatabaseSync): void => {
  const table = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='captures'`
    )
    .get();

  if (!table) {
    throw new Error(
      'CaptureStore requires "captures" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteCaptureStore = (db: DatabaseSync, clock: Clock): CaptureStore => {
  validateSchema(db);

  return {
    save: (capture: Capture): ResultAsync<void, StorageError> => {
      try {
        const stmt = db.prepare(`
          INSERT INTO captures (
            id, organization_id, created_by_id, content, title,
            source_url, source_app, status, captured_at, trashed_at, snoozed_until
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          capture.trashedAt ?? null,
          capture.snoozedUntil ?? null
        );

        return okAsync(undefined);
      } catch (error) {
        return errAsync(storageError('Failed to save capture', error));
      }
    },

    findById: (id: string): ResultAsync<Capture | null, StorageError> => {
      try {
        // Exclude soft-deleted captures
        const stmt = db.prepare(`SELECT * FROM captures WHERE id = ? AND deleted_at IS NULL`);
        const row = stmt.get(id) as CaptureRow | undefined;

        return okAsync(row ? rowToCapture(row) : null);
      } catch (error) {
        return errAsync(storageError('Failed to find capture', error));
      }
    },

    update: (capture: Capture): ResultAsync<void, StorageError> => {
      try {
        const stmt = db.prepare(`
          UPDATE captures SET
            content = ?,
            title = ?,
            status = ?,
            trashed_at = ?,
            snoozed_until = ?,
            processed_at = ?,
            processed_to_type = ?,
            processed_to_id = ?
          WHERE id = ?
        `);

        stmt.run(
          capture.content,
          capture.title ?? null,
          capture.status,
          capture.trashedAt ?? null,
          capture.snoozedUntil ?? null,
          capture.processedAt ?? null,
          capture.processedToType ?? null,
          capture.processedToId ?? null,
          capture.id
        );

        return okAsync(undefined);
      } catch (error) {
        return errAsync(storageError('Failed to update capture', error));
      }
    },

    findByOrganization: (
      options: FindByOrganizationOptions
    ): ResultAsync<FindByOrganizationResult, StorageError> => {
      try {
        const { organizationId, status, snoozed, now, limit = 50 } = options;

        let sql = `
          SELECT * FROM captures
          WHERE organization_id = ?
            AND deleted_at IS NULL
        `;
        const params: (string | number)[] = [organizationId];

        if (status) {
          sql += ` AND status = ?`;
          params.push(status);
        }

        // Handle snoozed filtering
        // snoozed = true: only captures where snoozed_until > now
        // snoozed = false: only captures where snoozed_until is null or snoozed_until <= now
        // snoozed = undefined: no filtering by snooze status
        if (snoozed !== undefined && now) {
          if (snoozed) {
            // Only snoozed items
            sql += ` AND snoozed_until IS NOT NULL AND snoozed_until > ?`;
            params.push(now);
          } else {
            // Exclude snoozed items (show expired snoozes and non-snoozed)
            sql += ` AND (snoozed_until IS NULL OR snoozed_until <= ?)`;
            params.push(now);
          }
        }

        // Sorting depends on whether we're querying snoozed items
        if (snoozed === true) {
          // Snoozed view: sort by snooze time ascending (soonest first)
          sql += ` ORDER BY snoozed_until ASC LIMIT ?`;
        } else {
          // Inbox/trashed: sort by captured_at DESC (newest first)
          sql += ` ORDER BY captured_at DESC LIMIT ?`;
        }
        params.push(limit);

        const stmt = db.prepare(sql);
        const rows = stmt.all(...params) as CaptureRow[];

        const captures = rows.map(rowToCapture);

        return okAsync({ captures });
      } catch (error) {
        return errAsync(storageError('Failed to find captures', error));
      }
    },

    softDelete: (id: string): ResultAsync<void, StorageError> => {
      try {
        const stmt = db.prepare(`
          UPDATE captures SET deleted_at = ?
          WHERE id = ? AND deleted_at IS NULL
        `);
        stmt.run(clock.now().toISOString(), id);
        return okAsync(undefined);
      } catch (error) {
        return errAsync(storageError('Failed to delete capture', error));
      }
    },

    softDeleteTrashed: (organizationId: string): ResultAsync<number, StorageError> => {
      try {
        const stmt = db.prepare(`
          UPDATE captures SET deleted_at = ?
          WHERE organization_id = ? AND status = 'trashed' AND deleted_at IS NULL
        `);
        const result = stmt.run(clock.now().toISOString(), organizationId);
        return okAsync(Number(result.changes));
      } catch (error) {
        return errAsync(storageError('Failed to empty trash', error));
      }
    },

    markAsProcessed: (options: MarkAsProcessedOptions): ResultAsync<Capture, StorageError> => {
      try {
        const stmt = db.prepare(`
          UPDATE captures SET
            status = 'processed',
            processed_at = ?,
            processed_to_type = ?,
            processed_to_id = ?
          WHERE id = ? AND deleted_at IS NULL
        `);

        stmt.run(
          options.processedAt,
          options.processedToType,
          options.processedToId,
          options.id
        );

        // Fetch the updated capture to return
        const selectStmt = db.prepare(`SELECT * FROM captures WHERE id = ? AND deleted_at IS NULL`);
        const row = selectStmt.get(options.id) as CaptureRow | undefined;

        if (!row) {
          return errAsync(storageError('Capture not found after update'));
        }

        return okAsync(rowToCapture(row));
      } catch (error) {
        return errAsync(storageError('Failed to mark capture as processed', error));
      }
    },
  };
};
