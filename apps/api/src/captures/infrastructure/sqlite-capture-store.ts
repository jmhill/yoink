import type { Database } from '../../database/types.js';
import { Result, ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow';
import { z } from 'zod';
import {
  CaptureStatusSchema,
  ProcessedToTypeSchema,
  type Capture,
  type ProcessedToType,
} from '@yoink/api-contracts';
import type { Clock } from '@yoink/infrastructure';
import type {
  CaptureStore,
  FindByOrganizationOptions,
  MarkAsProcessedOptions,
  MarkAsProcessedError,
} from '../domain/capture-store.js';
import { storageError, captureNotInInboxError, type StorageError } from '../domain/capture-errors.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import { pageSqlite } from '../../listing/infrastructure/page-sqlite.js';
import {
  captureFeedDirection,
  snoozedCaptureDirection,
} from '../../listing/domain/list-keys.js';

const CaptureRowSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  created_by_id: z.string(),
  content: z.string(),
  title: z.string().nullish(),
  source_url: z.string().nullish(),
  source_app: z.string().nullish(),
  status: CaptureStatusSchema,
  captured_at: z.string(),
  trashed_at: z.string().nullish(),
  snoozed_until: z.string().nullish(),
  processed_at: z.string().nullish(),
  processed_to_type: z.string().nullish(),
  processed_to_id: z.string().nullish(),
});

type CaptureRow = z.infer<typeof CaptureRowSchema>;

const captureFromUnknown = (row: unknown): Result<Capture, StorageError> => {
  const parsed = CaptureRowSchema.safeParse(row);
  if (!parsed.success) {
    return err(storageError('Invalid capture row'));
  }
  return ok(rowToCapture(parsed.data));
};

const processedToTypeFromRow = (value: string | null): ProcessedToType | undefined => {
  if (value === null) {
    return undefined;
  }
  const parsed = ProcessedToTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const rowToCapture = (row: CaptureRow): Capture => ({
  id: row.id,
  organizationId: row.organization_id,
  createdById: row.created_by_id,
  content: row.content,
  title: row.title ?? undefined,
  sourceUrl: row.source_url ?? undefined,
  sourceApp: row.source_app ?? undefined,
  status: row.status,
  capturedAt: row.captured_at,
  trashedAt: row.trashed_at ?? undefined,
  snoozedUntil: row.snoozed_until ?? undefined,
  processedAt: row.processed_at ?? undefined,
  processedToType: processedToTypeFromRow(row.processed_to_type ?? null),
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
      ).andThen((result) => {
        const raw = result.rows[0];
        if (raw === undefined) {
          return okAsync(null);
        }
        const parsed = captureFromUnknown(raw);
        if (parsed.isErr()) {
          return errAsync(parsed.error);
        }
        return okAsync(parsed.value);
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
    ): ResultAsync<KeysetRows<Capture>, StorageError> => {
      const { organizationId, status, snoozed, now, fetchLimit, seek } = options;

      let whereSql = `
        organization_id = ?
          AND deleted_at IS NULL
      `;
      const whereArgs: (string | number)[] = [organizationId];

      if (status) {
        whereSql += ` AND status = ?`;
        whereArgs.push(status);
      }

      if (snoozed !== undefined && now) {
        if (snoozed) {
          whereSql += ` AND snoozed_until IS NOT NULL AND snoozed_until > ?`;
          whereArgs.push(now);
        } else {
          whereSql += ` AND (snoozed_until IS NULL OR snoozed_until <= ?)`;
          whereArgs.push(now);
        }
      }

      const snoozedView = snoozed === true;
      return pageSqlite({
        db,
        from: 'captures',
        whereSql,
        whereArgs,
        orderSql: snoozedView
          ? `ORDER BY snoozed_until ASC, id ASC`
          : `ORDER BY captured_at DESC, id DESC`,
        keyColumns: snoozedView
          ? ['snoozed_until', 'id']
          : ['captured_at', 'id'],
        direction: snoozedView ? snoozedCaptureDirection : captureFeedDirection,
        fetchLimit,
        seek,
        mapRow: (row) => row,
        errorMessage: 'Failed to find captures',
      }).andThen((page) =>
        Result.combine(page.rows.map(captureFromUnknown)).map((rows) => ({ ...page, rows }))
      );
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
            const existing = z
              .object({ status: z.string() })
              .safeParse(checkResult.rows[0]);

            if (existing.success && existing.data.status !== options.requiredStatus) {
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
          const parsed = captureFromUnknown(selectResult.rows[0]);
          if (parsed.isErr()) {
            return errAsync<Capture, MarkAsProcessedError>(
              storageError('Capture not found after update')
            );
          }
          return okAsync<Capture, MarkAsProcessedError>(parsed.value);
        });
      });
    },
  };
};
