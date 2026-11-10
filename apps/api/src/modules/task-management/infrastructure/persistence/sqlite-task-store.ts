import type { Task } from '../../domain/model/task.js';
import type { Database } from '../../../../platform/database/types.js';
import { errAsync, okAsync, Result, ResultAsync } from 'neverthrow';

import type { TaskStore, FindByOrganizationOptions } from './ports/task-store.js';
import { storageError, type StorageError } from '../../domain/messages/task-errors.js';
import type { KeysetCursor } from '../../../../kernel/listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../../../kernel/listing/domain/listed-page.js';
import { pageSqlite } from '../../../../platform/sql/page-sqlite.js';
import {
  completedTaskDirection,
  finishedProjectTaskDirection,
  openPileTaskDirection,
  projectTaskDirection,
  taskBoardDirection,
} from '../../../../kernel/listing/domain/list-keys.js';
import { parseTaskRow } from './rows/parse-task-row.js';

const parseRows = (rows: Record<string, unknown>[]): Result<Task[], StorageError> =>
  Result.combine(rows.map(parseTaskRow));

const parsePage = (
  page: KeysetRows<Record<string, unknown>>
): ResultAsync<KeysetRows<Task>, StorageError> => {
  const parsed = parseRows(page.rows);
  return parsed.isOk()
    ? okAsync({ rows: parsed.value, total: page.total })
    : errAsync(parsed.error);
};

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
  db: Database
): Promise<TaskStore> => {
  await validateSchema(db);

  return {
    findById: (id: string): ResultAsync<Task | null, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL`,
          args: [id],
        }),
        (error) => storageError('Failed to find task', error)
      ).andThen((result) => {
        const row = result.rows[0];
        if (!row) {
          return okAsync(null);
        }
        const parsed = parseTaskRow(row);
        return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
      });
    },

    findByIds: (ids: readonly string[]): ResultAsync<Task[], StorageError> => {
      if (ids.length === 0) {
        return okAsync([]);
      }
      const placeholders = ids.map(() => '?').join(', ');
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM tasks WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
          args: [...ids],
        }),
        (error) => storageError('Failed to find tasks', error)
      ).andThen((result) => {
        const parsed = parseRows(result.rows);
        return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
      });
    },

    findByIdIncludingDeleted: (id: string): ResultAsync<Task | null, StorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM tasks WHERE id = ?`,
          args: [id],
        }),
        (error) => storageError('Failed to find task', error)
      ).andThen((result) => {
        const row = result.rows[0];
        if (!row) {
          return okAsync(null);
        }
        const parsed = parseTaskRow(row);
        return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
      });
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
          whereArgs.push(today);
          break;
        case 'upcoming':
          whereSql += ` AND due_date > ? AND completed_at IS NULL`;
          whereArgs.push(today);
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
        mapRow: (row) => row,
        errorMessage: 'Failed to find tasks',
      }).andThen(parsePage);
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
      ).andThen((result) => {
        const row = result.rows[0];
        if (!row) {
          return okAsync(null);
        }
        const parsed = parseTaskRow(row);
        return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
      });
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
        mapRow: (row) => row,
        errorMessage: 'Failed to list open tasks in pile',
      }).andThen(parsePage);
    },

    pageOpenInProject: (options: {
      organizationId: string;
      projectId: string;
      fetchLimit: number;
      seek?: KeysetCursor;
    }): ResultAsync<KeysetRows<Task>, StorageError> => {
      return pageSqlite({
        db,
        from: 'tasks',
        whereSql: `
          organization_id = ?
            AND project_id = ?
            AND completed_at IS NULL
            AND deleted_at IS NULL
        `,
        whereArgs: [options.organizationId, options.projectId],
        orderSql: `ORDER BY created_at DESC, id DESC`,
        keyColumns: ['created_at', 'id'],
        direction: projectTaskDirection,
        fetchLimit: options.fetchLimit,
        seek: options.seek,
        mapRow: (row) => row,
        errorMessage: 'Failed to list open tasks in project',
      }).andThen(parsePage);
    },

    pageFinishedInProject: (options: {
      organizationId: string;
      projectId: string;
      fetchLimit: number;
      seek?: KeysetCursor;
      completedAfter?: string;
      completedBefore?: string;
    }): ResultAsync<KeysetRows<Task>, StorageError> => {
      let whereSql = `
        organization_id = ?
          AND project_id = ?
          AND completed_at IS NOT NULL
          AND deleted_at IS NULL
      `;
      const whereArgs: (string | number)[] = [options.organizationId, options.projectId];
      if (options.completedAfter) {
        whereSql += ` AND completed_at >= ?`;
        whereArgs.push(options.completedAfter);
      }
      if (options.completedBefore) {
        whereSql += ` AND completed_at < ?`;
        whereArgs.push(options.completedBefore);
      }
      return pageSqlite({
        db,
        from: 'tasks',
        whereSql,
        whereArgs,
        orderSql: `ORDER BY completed_at DESC, id DESC`,
        keyColumns: ['completed_at', 'id'],
        direction: finishedProjectTaskDirection,
        fetchLimit: options.fetchLimit,
        seek: options.seek,
        mapRow: (row) => row,
        errorMessage: 'Failed to list finished tasks in project',
      }).andThen(parsePage);
    },

    pageFinishedWithProject: (options: {
      organizationId: string;
      completedAfter: string;
      completedBefore: string;
      fetchLimit: number;
      seek?: KeysetCursor;
    }): ResultAsync<KeysetRows<Task>, StorageError> =>
      pageSqlite({
        db,
        from: `
          tasks t
          JOIN projects p
            ON p.id = t.project_id
           AND p.organization_id = t.organization_id
        `,
        selectSql: 'SELECT t.*',
        whereSql: `
          t.organization_id = ?
            AND t.project_id IS NOT NULL
            AND t.completed_at IS NOT NULL
            AND t.completed_at >= ?
            AND t.completed_at < ?
            AND t.deleted_at IS NULL
        `,
        whereArgs: [options.organizationId, options.completedAfter, options.completedBefore],
        orderSql: `ORDER BY t.completed_at DESC, t.id DESC`,
        keyColumns: ['t.completed_at', 't.id'],
        direction: finishedProjectTaskDirection,
        fetchLimit: options.fetchLimit,
        seek: options.seek,
        mapRow: (row) => row,
        errorMessage: 'Failed to list finished tasks on a project',
      }).andThen(parsePage),

    countFinishedWithoutProject: (options: {
      organizationId: string;
      completedAfter: string;
      completedBefore: string;
    }): ResultAsync<number, StorageError> =>
      ResultAsync.fromPromise(
        db.execute({
          sql: `
            SELECT COUNT(*) AS count
            FROM tasks
            WHERE organization_id = ?
              AND project_id IS NULL
              AND completed_at IS NOT NULL
              AND completed_at >= ?
              AND completed_at < ?
              AND deleted_at IS NULL
          `,
          args: [options.organizationId, options.completedAfter, options.completedBefore],
        }),
        (error) => storageError('Failed to count finished tasks without a project', error)
      ).map((result) => {
        const count = Number(result.rows[0]?.count ?? 0);
        return Number.isFinite(count) ? count : 0;
      }),

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
      ).andThen((result) => {
        const parsed = parseRows(result.rows);
        return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
      });
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
  };
};
