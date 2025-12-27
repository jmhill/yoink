import type { Database } from '../../database/types.js';
import { ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { Clock } from '@yoink/infrastructure';
import type {
  TaskStore,
  FindByOrganizationOptions,
  FindByOrganizationResult,
} from '../domain/task-store.js';
import { storageError, type StorageError } from '../domain/task-errors.js';

type TaskRow = {
  id: string;
  organization_id: string;
  created_by_id: string;
  title: string;
  capture_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  pinned_at: string | null;
  created_at: string;
};

const rowToTask = (row: TaskRow): Task => ({
  id: row.id,
  organizationId: row.organization_id,
  createdById: row.created_by_id,
  title: row.title,
  captureId: row.capture_id ?? undefined,
  dueDate: row.due_date ?? undefined,
  completedAt: row.completed_at ?? undefined,
  pinnedAt: row.pinned_at ?? undefined,
  createdAt: row.created_at,
});

/**
 * Validates that the required database schema exists.
 * Throws an error if migrations have not been run.
 */
const validateSchema = async (db: Database): Promise<void> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'`,
  });

  if (result.rows.length === 0) {
    throw new Error(
      'TaskStore requires "tasks" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteTaskStore = async (
  db: Database,
  clock: Clock
): Promise<TaskStore> => {
  await validateSchema(db);

  return {
    save: (task: Task): ResultAsync<void, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            INSERT INTO tasks (
              id, organization_id, created_by_id, title, capture_id,
              due_date, completed_at, pinned_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [
            task.id,
            task.organizationId,
            task.createdById,
            task.title,
            task.captureId ?? null,
            task.dueDate ?? null,
            task.completedAt ?? null,
            task.pinnedAt ?? null,
            task.createdAt,
          ],
        }),
        (error) => storageError('Failed to save task', error)
      ).map(() => undefined);
    },

    findById: (id: string): ResultAsync<Task | null, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL`,
          args: [id],
        }),
        (error) => storageError('Failed to find task', error)
      ).map((result) => {
        const row = result.rows[0] as TaskRow | undefined;
        return row ? rowToTask(row) : null;
      });
    },

    update: (task: Task): ResultAsync<void, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            UPDATE tasks SET
              title = ?,
              due_date = ?,
              completed_at = ?,
              pinned_at = ?
            WHERE id = ?
          `,
          args: [
            task.title,
            task.dueDate ?? null,
            task.completedAt ?? null,
            task.pinnedAt ?? null,
            task.id,
          ],
        }),
        (error) => storageError('Failed to update task', error)
      ).map(() => undefined);
    },

    findByOrganization: (
      options: FindByOrganizationOptions
    ): ResultAsync<FindByOrganizationResult, StorageError> => {
      const { organizationId, filter, today, limit = 50 } = options;

      let sql = `
        SELECT * FROM tasks
        WHERE organization_id = ?
          AND deleted_at IS NULL
      `;
      const params: (string | number)[] = [organizationId];

      // Apply filter
      switch (filter) {
        case 'today':
          // Tasks due today (and not completed)
          sql += ` AND due_date = ? AND completed_at IS NULL`;
          params.push(today ?? new Date().toISOString().split('T')[0]);
          break;
        case 'upcoming':
          // Tasks due after today (and not completed)
          sql += ` AND due_date > ? AND completed_at IS NULL`;
          params.push(today ?? new Date().toISOString().split('T')[0]);
          break;
        case 'completed':
          // Only completed tasks
          sql += ` AND completed_at IS NOT NULL`;
          break;
        case 'all':
        default:
          // All incomplete tasks (tasks without due dates appear here too)
          sql += ` AND completed_at IS NULL`;
          break;
      }

      // Sort: pinned first, then by created_at (newest first)
      // For completed, sort by completed_at DESC
      if (filter === 'completed') {
        sql += ` ORDER BY completed_at DESC LIMIT ?`;
      } else {
        sql += ` ORDER BY pinned_at DESC NULLS LAST, created_at DESC LIMIT ?`;
      }
      params.push(limit);

      return ResultAsync.fromPromise(
        db.execute({ sql, args: params }),
        (error) => storageError('Failed to find tasks', error)
      ).map((result) => {
        const rows = result.rows as TaskRow[];
        return { tasks: rows.map(rowToTask) };
      });
    },

    findByCaptureId: (captureId: string): ResultAsync<Task | null, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            SELECT * FROM tasks 
            WHERE capture_id = ? AND deleted_at IS NULL
          `,
          args: [captureId],
        }),
        (error) => storageError('Failed to find task by capture', error)
      ).map((result) => {
        const row = result.rows[0] as TaskRow | undefined;
        return row ? rowToTask(row) : null;
      });
    },

    softDelete: (id: string): ResultAsync<void, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            UPDATE tasks SET deleted_at = ?
            WHERE id = ? AND deleted_at IS NULL
          `,
          args: [clock.now().toISOString(), id],
        }),
        (error) => storageError('Failed to delete task', error)
      ).map(() => undefined);
    },
  };
};
