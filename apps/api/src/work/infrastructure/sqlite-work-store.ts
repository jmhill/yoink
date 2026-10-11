import { errAsync, ok, okAsync, Result, ResultAsync } from 'neverthrow';
import type { NowNextActionItem, Task } from '@yoink/api-contracts';
import type { Database } from '../../database/types.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import {
  UNDATED_DUE_SENTINEL,
  workDueDirection,
  workListDirection,
  workNextActionDirection,
} from '../../listing/domain/list-keys.js';
import { pageSqlite } from '../../listing/infrastructure/page-sqlite.js';
import { sqlKeysetClause } from '../../listing/infrastructure/sql-keyset.js';
import { parseTaskRow } from '../../tasks/infrastructure/parse-task-row.js';
import { storageError, type StorageError } from '../domain/work-errors.js';
import type {
  PageNowDueOptions,
  PageNowNextActionsOptions,
  PageWorkListsOptions,
  WorkListsPageRows,
  WorkStore,
} from '../domain/work-store.js';
import { parseNowNextActionRow } from './parse-now-next-action-row.js';
import { parseWorkListRow } from './parse-work-list-row.js';

const NEXT_ACTIONS_FROM = `
  (
    SELECT
      t.id,
      t.organization_id,
      t.created_by_id,
      t.title,
      t.capture_id,
      t.due_date,
      t.completed_at,
      t.pinned_at,
      t.created_at,
      t.assignee_id,
      t.list_id,
      t.project_id,
      t.open_order,
      t.last_changed_at,
      t.last_changed_by,
      t.completed_by,
      p.id AS now_project_id,
      p.name AS now_project_name,
      COALESCE(t.due_date, '${UNDATED_DUE_SENTINEL}') AS due_sentinel,
      LOWER(p.name) AS project_name_lower
    FROM projects p
    INNER JOIN tasks t
      ON t.id = p.next_action_task_id
     AND t.organization_id = p.organization_id
     AND t.completed_at IS NULL
     AND t.deleted_at IS NULL
    WHERE p.status = 'active'
  )
`;

const ownerClause = (
  owner: PageNowNextActionsOptions['owner'],
  callerId: string
): { sql: string; args: (string | number)[] } =>
  owner === 'me' ? { sql: ' AND assignee_id = ?', args: [callerId] } : { sql: '', args: [] };

const parseTaskPage = (
  page: KeysetRows<Record<string, unknown>>
): ResultAsync<KeysetRows<Task>, StorageError> => {
  const parsed = Result.combine(page.rows.map(parseTaskRow));
  return parsed.isOk()
    ? okAsync({ rows: parsed.value, total: page.total })
    : errAsync(parsed.error);
};

const parseNextActionPage = (
  page: KeysetRows<Record<string, unknown>>
): ResultAsync<KeysetRows<NowNextActionItem>, StorageError> => {
  const parsed = Result.combine(page.rows.map(parseNowNextActionRow));
  return parsed.isOk()
    ? okAsync({ rows: parsed.value, total: page.total })
    : errAsync(parsed.error);
};

export const createSqliteWorkStore = (db: Database): WorkStore => ({
  pageNextActions: (
    options: PageNowNextActionsOptions
  ): ResultAsync<KeysetRows<NowNextActionItem>, StorageError> => {
    const owner = ownerClause(options.owner, options.callerId);
    return pageSqlite({
      db,
      from: NEXT_ACTIONS_FROM,
      whereSql: `organization_id = ?${owner.sql}`,
      whereArgs: [options.organizationId, ...owner.args],
      orderSql: 'ORDER BY due_sentinel ASC, project_name_lower ASC, id ASC',
      keyColumns: ['due_sentinel', 'project_name_lower', 'id'],
      direction: workNextActionDirection,
      fetchLimit: options.fetchLimit,
      seek: options.seek,
      mapRow: (row) => row,
      errorMessage: 'Failed to list now next actions',
    }).andThen(parseNextActionPage);
  },

  pageDue: (options: PageNowDueOptions): ResultAsync<KeysetRows<Task>, StorageError> => {
    const owner = ownerClause(options.owner, options.callerId);
    return pageSqlite({
      db,
      from: 'tasks',
      whereSql: `
        organization_id = ?
          AND deleted_at IS NULL
          AND completed_at IS NULL
          AND due_date IS NOT NULL
          AND due_date <= ?
          AND id NOT IN (
            SELECT p.next_action_task_id
            FROM projects p
            INNER JOIN tasks nt
              ON nt.id = p.next_action_task_id
             AND nt.organization_id = p.organization_id
             AND nt.completed_at IS NULL
             AND nt.deleted_at IS NULL
            WHERE p.organization_id = ?
              AND p.status = 'active'
              AND p.next_action_task_id IS NOT NULL
          )
          ${owner.sql}
      `,
      whereArgs: [options.organizationId, options.today, options.organizationId, ...owner.args],
      orderSql: 'ORDER BY due_date ASC, created_at ASC, id ASC',
      keyColumns: ['due_date', 'created_at', 'id'],
      direction: workDueDirection,
      fetchLimit: options.fetchLimit,
      seek: options.seek,
      mapRow: (row) => row,
      errorMessage: 'Failed to list now due tasks',
    }).andThen(parseTaskPage);
  },

  pageLists: (options: PageWorkListsOptions): ResultAsync<WorkListsPageRows, StorageError> => {
    const from = `
      (
        SELECT
          l.id AS id,
          l.name AS name,
          l.created_at AS created_at,
          COUNT(t.id) AS open_task_count
        FROM lists l
        LEFT JOIN tasks t
          ON t.list_id = l.id
         AND t.organization_id = l.organization_id
         AND t.completed_at IS NULL
         AND t.deleted_at IS NULL
        WHERE l.organization_id = ?
        GROUP BY l.id, l.name, l.created_at
      )
    `;
    const seekClauseResult = options.seek
      ? sqlKeysetClause({
          columns: ['name', 'created_at', 'id'],
          direction: workListDirection,
          seek: options.seek,
        })
      : ok(undefined);
    if (seekClauseResult.isErr()) {
      return errAsync(seekClauseResult.error);
    }
    const seekClause = seekClauseResult.value;
    const selectWhere = seekClause ? `1=1 AND ${seekClause.sql}` : '1=1';
    const selectArgs = seekClause
      ? [options.organizationId, ...seekClause.args, options.fetchLimit]
      : [options.organizationId, options.fetchLimit];

    return ResultAsync.fromPromise(
      db.batch(
        [
          {
            sql: `SELECT COUNT(*) AS count FROM ${from}`,
            args: [options.organizationId],
          },
          {
            sql: `SELECT * FROM ${from} WHERE ${selectWhere} ORDER BY name ASC, created_at ASC, id ASC LIMIT ?`,
            args: selectArgs,
          },
          {
            sql: `
              SELECT COUNT(*) AS count
              FROM tasks
              WHERE organization_id = ?
                AND list_id IS NULL
                AND completed_at IS NULL
                AND deleted_at IS NULL
            `,
            args: [options.organizationId],
          },
        ],
        'read'
      ),
      (cause) => storageError('Failed to list work lists', cause)
    ).andThen(([countResult, pageResult, unlistedResult]) => {
      const parsed = Result.combine((pageResult?.rows ?? []).map(parseWorkListRow));
      if (parsed.isErr()) {
        return errAsync(parsed.error);
      }
      return okAsync({
        lists: {
          rows: parsed.value,
          total: Number(countResult?.rows[0]?.count ?? 0),
        },
        unlistedOpenCount: Number(unlistedResult?.rows[0]?.count ?? 0),
      });
    });
  },
});
