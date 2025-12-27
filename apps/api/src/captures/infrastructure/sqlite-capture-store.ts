import type { Database } from '../../database/types.js';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { Capture } from '@yoink/api-contracts';
import type { Clock } from '@yoink/infrastructure';
import type {
  CaptureStore,
  FindByOrganizationOptions,
  FindByOrganizationResult,
  MarkAsProcessedOptions,
  MarkAsProcessedError,
} from '../domain/capture-store.js';
import { storageError, captureNotInInboxError, type StorageError } from '../domain/capture-errors.js';

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
const validateSchema = async (db: Database): Promise<void> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='captures'`,
  });

  if (result.rows.length === 0) {
    throw new Error(
      'CaptureStore requires "captures" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteCaptureStore = async (
  db: Database,
  clock: Clock
): Promise<CaptureStore> => {
  await validateSchema(db);

  return {
    save: (capture: Capture): ResultAsync<void, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            INSERT INTO captures (
              id, organization_id, created_by_id, content, title,
              source_url, source_app, status, captured_at, trashed_at, snoozed_until
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
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
            capture.snoozedUntil ?? null,
          ],
        }),
        (error) => storageError('Failed to save capture', error)
      ).map(() => undefined);
    },

    findById: (id: string): ResultAsync<Capture | null, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM captures WHERE id = ? AND deleted_at IS NULL`,
          args: [id],
        }),
        (error) => storageError('Failed to find capture', error)
      ).map((result) => {
        const row = result.rows[0] as CaptureRow | undefined;
        return row ? rowToCapture(row) : null;
      });
    },

    update: (capture: Capture): ResultAsync<void, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
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
          `,
          args: [
            capture.content,
            capture.title ?? null,
            capture.status,
            capture.trashedAt ?? null,
            capture.snoozedUntil ?? null,
            capture.processedAt ?? null,
            capture.processedToType ?? null,
            capture.processedToId ?? null,
            capture.id,
          ],
        }),
        (error) => storageError('Failed to update capture', error)
      ).map(() => undefined);
    },

    findByOrganization: (
      options: FindByOrganizationOptions
    ): ResultAsync<FindByOrganizationResult, StorageError> => {
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

      return ResultAsync.fromPromise(
        db.execute({ sql, args: params }),
        (error) => storageError('Failed to find captures', error)
      ).map((result) => {
        const rows = result.rows as CaptureRow[];
        return { captures: rows.map(rowToCapture) };
      });
    },

    softDelete: (id: string): ResultAsync<void, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            UPDATE captures SET deleted_at = ?
            WHERE id = ? AND deleted_at IS NULL
          `,
          args: [clock.now().toISOString(), id],
        }),
        (error) => storageError('Failed to delete capture', error)
      ).map(() => undefined);
    },

    softDeleteTrashed: (organizationId: string): ResultAsync<number, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            UPDATE captures SET deleted_at = ?
            WHERE organization_id = ? AND status = 'trashed' AND deleted_at IS NULL
          `,
          args: [clock.now().toISOString(), organizationId],
        }),
        (error) => storageError('Failed to empty trash', error)
      ).map((result) => result.rowsAffected);
    },

    markAsProcessed: (options: MarkAsProcessedOptions): ResultAsync<Capture, MarkAsProcessedError> => {
      // Build the UPDATE query with optional status check for atomic verification
      let sql = `
        UPDATE captures SET
          status = 'processed',
          processed_at = ?,
          processed_to_type = ?,
          processed_to_id = ?
        WHERE id = ? AND deleted_at IS NULL
      `;
      const params: string[] = [
        options.processedAt,
        options.processedToType,
        options.processedToId,
        options.id,
      ];

      // Add status check if requiredStatus is provided (for atomic verification)
      if (options.requiredStatus) {
        sql = `
          UPDATE captures SET
            status = 'processed',
            processed_at = ?,
            processed_to_type = ?,
            processed_to_id = ?
          WHERE id = ? AND deleted_at IS NULL AND status = ?
        `;
        params.push(options.requiredStatus);
      }

      return ResultAsync.fromPromise(
        db.execute({ sql, args: params }),
        (error) => storageError('Failed to mark capture as processed', error)
      ).andThen((result) => {
        // If requiredStatus was provided and no rows were updated, the status didn't match
        if (options.requiredStatus && result.rowsAffected === 0) {
          // Check if the capture exists but has wrong status
          return ResultAsync.fromPromise(
            db.execute({
              sql: `SELECT status FROM captures WHERE id = ? AND deleted_at IS NULL`,
              args: [options.id],
            }),
            (error) => storageError('Failed to check capture status', error)
          ).andThen((checkResult) => {
            const existing = checkResult.rows[0] as { status: string } | undefined;

            if (existing && existing.status !== options.requiredStatus) {
              return errAsync<Capture, MarkAsProcessedError>(captureNotInInboxError(options.id));
            }
            // Capture doesn't exist
            return errAsync<Capture, MarkAsProcessedError>(storageError('Capture not found'));
          });
        }

        // Fetch the updated capture to return
        return ResultAsync.fromPromise(
          db.execute({
            sql: `SELECT * FROM captures WHERE id = ? AND deleted_at IS NULL`,
            args: [options.id],
          }),
          (error) => storageError('Failed to fetch updated capture', error)
        ).andThen((selectResult) => {
          const row = selectResult.rows[0] as CaptureRow | undefined;

          if (!row) {
            return errAsync<Capture, MarkAsProcessedError>(storageError('Capture not found after update'));
          }

          return okAsync<Capture, MarkAsProcessedError>(rowToCapture(row));
        });
      });
    },
  };
};
