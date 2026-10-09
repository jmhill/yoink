import type { Database } from '../../database/types.js';
import { okAsync, ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { Clock } from '@yoink/infrastructure';
import type { TaskStore, FindByOrganizationOptions } from '../domain/task-store.js';
import { storageError, type StorageError } from '../domain/task-errors.js';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import { pageSqlite } from '../../listing/infrastructure/page-sqlite.js';
import {
  completedTaskDirection,
  openPileTaskDirection,
  taskBoardDirection,
} from '../../listing/domain/list-keys.js';
import {
  insertTaskQuery,
  setOpenOrderQueries,
  updateTaskQuery,
} from './task-row-statements.js';

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
  assignee_id: string | null;
  list_id: string | null;
  open_order: number | null;
  last_changed_at: string | null;
  last_changed_by: string | null;
  completed_by: string | null;
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
  ...(row.assignee_id ? { assigneeId: row.assignee_id } : {}),
  ...(row.list_id ? { listId: row.list_id } : {}),
  ...(row.open_order !== null && row.open_order !== undefined
    ? { openOrder: Number(row.open_order) }
    : {}),
  lastChangedAt: row.last_changed_at ?? null,
  lastChangedBy: row.last_changed_by ?? null,
  completedBy: row.completed_by ?? null,
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
        db.execute(insertTaskQuery(task)),
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
        db.execute(updateTaskQuery(task)),
        (error) => storageError('Failed to update task', error)
      ).map(() => undefined);
    },

    findByOrganization: (
      options: FindByOrganizationOptions
    ): ResultAsync<KeysetRows<Task>, StorageError> => {
      const { organizationId, filter, today, fetchLimit, seek, assigneeId } = options;

      let whereSql = `
        organization_id = ?
          AND deleted_at IS NULL
      `;
      const whereArgs: (string | number)[] = [organizationId];

      switch (filter) {
        case 'today':
          whereSql += ` AND due_date <= ? AND completed_at IS NULL`;
          whereArgs.push(today ?? new Date().toISOString().split('T')[0]);
          break;
        case 'upcoming':
          whereSql += ` AND due_date > ? AND completed_at IS NULL`;
          whereArgs.push(today ?? new Date().toISOString().split('T')[0]);
          break;
        case 'completed':
          whereSql += ` AND completed_at IS NOT NULL`;
          break;
        case 'mine':
          whereSql += ` AND assignee_id = ? AND completed_at IS NULL`;
          whereArgs.push(assigneeId ?? '');
          break;
        case 'all':
        default:
          whereSql += ` AND completed_at IS NULL`;
          break;
      }

      const completed = filter === 'completed';
      const orderSql = completed
        ? `ORDER BY completed_at DESC, id DESC`
        : `ORDER BY COALESCE(pinned_at, '') DESC, created_at DESC, id DESC`;
      const keyColumns = completed
        ? (['completed_at', 'id'] as const)
        : ([`COALESCE(pinned_at, '')`, 'created_at', 'id'] as const);
      const direction = completed ? completedTaskDirection : taskBoardDirection;

      return pageSqlite({
        db,
        from: 'tasks',
        whereSql,
        whereArgs,
        orderSql,
        keyColumns,
        direction,
        fetchLimit,
        seek,
        mapRow: (row) => rowToTask(row as TaskRow),
        errorMessage: 'Failed to find tasks',
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

    countOpenOnList: (listId: string): ResultAsync<number, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            SELECT COUNT(*) AS count
            FROM tasks
            WHERE list_id = ?
              AND completed_at IS NULL
              AND deleted_at IS NULL
          `,
          args: [listId],
        }),
        (error) => storageError('Failed to count open tasks on list', error)
      ).map((result) => Number(result.rows[0]?.count ?? 0));
    },

    pageOpenInPile: (options: {
      organizationId: string;
      listId: string | null;
      fetchLimit: number;
      seek?: KeysetCursor;
    }): ResultAsync<KeysetRows<Task>, StorageError> => {
      const listClause = options.listId === null ? 'list_id IS NULL' : 'list_id = ?';
      const whereArgs =
        options.listId === null
          ? [options.organizationId]
          : [options.organizationId, options.listId];
      return pageSqlite({
        db,
        from: 'tasks',
        whereSql: `
          organization_id = ?
            AND ${listClause}
            AND completed_at IS NULL
            AND deleted_at IS NULL
        `,
        whereArgs,
        orderSql: `ORDER BY COALESCE(open_order, 2147483647) ASC, created_at ASC, id ASC`,
        keyColumns: [`COALESCE(open_order, 2147483647)`, 'created_at', 'id'],
        direction: openPileTaskDirection,
        fetchLimit: options.fetchLimit,
        seek: options.seek,
        mapRow: (row) => rowToTask(row as TaskRow),
        errorMessage: 'Failed to list open tasks in pile',
      });
    },

    findOpenInPile: (options: {
      organizationId: string;
      listId: string | null;
    }): ResultAsync<Task[], StorageError> => {
      const listClause = options.listId === null ? 'list_id IS NULL' : 'list_id = ?';
      const args =
        options.listId === null
          ? [options.organizationId]
          : [options.organizationId, options.listId];

      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            SELECT * FROM tasks
            WHERE organization_id = ?
              AND ${listClause}
              AND completed_at IS NULL
              AND deleted_at IS NULL
            ORDER BY open_order ASC NULLS LAST, created_at ASC, id ASC
          `,
          args,
        }),
        (error) => storageError('Failed to list open tasks in pile', error)
      ).map((result) => (result.rows as TaskRow[]).map(rowToTask));
    },

    nextOpenOrderInPile: (options: {
      organizationId: string;
      listId: string | null;
    }): ResultAsync<number, StorageError> => {
      const listClause = options.listId === null ? 'list_id IS NULL' : 'list_id = ?';
      const args =
        options.listId === null
          ? [options.organizationId]
          : [options.organizationId, options.listId];

      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            SELECT COALESCE(MAX(open_order), -1) + 1 AS next_order
            FROM tasks
            WHERE organization_id = ?
              AND ${listClause}
              AND completed_at IS NULL
              AND deleted_at IS NULL
          `,
          args,
        }),
        (error) => storageError('Failed to load next open order', error)
      ).map((result) => Number(result.rows[0]?.next_order ?? 0));
    },

    setOpenOrders: (
      updates: { id: string; openOrder: number }[]
    ): ResultAsync<void, StorageError> => {
      if (updates.length === 0) {
        return okAsync(undefined);
      }

      return ResultAsync.fromPromise(
        db.batch(setOpenOrderQueries(updates), 'write'),
        (error) => storageError('Failed to set open order', error)
      ).map(() => undefined);
    },

    clearListIdOnCompleted: (listId: string): ResultAsync<void, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            UPDATE tasks
            SET list_id = NULL
            WHERE list_id = ?
              AND (completed_at IS NOT NULL OR deleted_at IS NOT NULL)
          `,
          args: [listId],
        }),
        (error) => storageError('Failed to clear list on completed tasks', error)
      ).map(() => undefined);
    },
  };
};
