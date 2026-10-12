import { errAsync, ok, okAsync, Result, ResultAsync } from 'neverthrow';
import type { Database } from '../../database/types.js';
import { DEFAULT_VIEWER_TIME_ZONE } from '../../shared/domain/viewer-today.js';
import { pageSqlite } from '../../listing/infrastructure/page-sqlite.js';
import { pageOrdered } from '../../listing/domain/keyset-window.js';
import { doneListDirection, reviewDirection, reviewKeys } from '../../listing/domain/list-keys.js';
import { buildReviewItems, type ReviewCandidate } from '../domain/build-review.js';
import { countReviewReasons } from '../domain/review-order.js';
import { storageError, type StorageError } from '../domain/review-errors.js';
import type { PageDoneListOptions, PageReviewOptions, ReviewStore } from '../domain/review-store.js';
import { parseDoneListRow } from './parse-done-row.js';
import { parseReviewCandidateRow } from './parse-review-row.js';

const CANDIDATE_SQL = `
  SELECT
    p.id,
    p.organization_id,
    p.created_by_id,
    p.name,
    p.objective,
    p.status,
    p.waiting_on,
    p.waiting_since,
    p.next_action_task_id,
    p.created_at,
    p.last_changed_at,
    p.last_changed_by,
    p.notebook_pages,
    MAX(
      p.last_changed_at,
      p.created_at,
      COALESCE(
        (
          SELECT MAX(cl.occurred_at)
          FROM change_log cl
          WHERE cl.project_id = p.id
            AND cl.organization_id = p.organization_id
        ),
        p.created_at
      )
    ) AS review_last_change_at,
    na.id AS next_action_id,
    na.title AS next_action_title,
    na.due_date AS next_action_due_date
  FROM projects p
  LEFT JOIN tasks na
    ON na.id = p.next_action_task_id
   AND na.organization_id = p.organization_id
   AND na.deleted_at IS NULL
  WHERE p.organization_id = ?
    AND p.status IN ('active', 'waiting')
`;

const loadCandidates = (
  db: Database,
  organizationId: string
): ResultAsync<ReviewCandidate[], StorageError> =>
  ResultAsync.fromPromise(
    db.execute({ sql: CANDIDATE_SQL, args: [organizationId] }),
    (cause) => storageError('Failed to list review projects', cause)
  ).andThen((result) => {
    const parsed = Result.combine(result.rows.map(parseReviewCandidateRow));
    return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
  });

const DONE_FROM = `
  tasks t
  JOIN projects p
    ON p.id = t.project_id
   AND p.organization_id = t.organization_id
  LEFT JOIN tasks na
    ON na.id = p.next_action_task_id
   AND na.organization_id = p.organization_id
   AND na.deleted_at IS NULL
`;

const DONE_SELECT = `
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
    p.id AS p_id,
    p.organization_id AS p_organization_id,
    p.created_by_id AS p_created_by_id,
    p.name AS p_name,
    p.objective AS p_objective,
    p.status AS p_status,
    p.waiting_on AS p_waiting_on,
    p.waiting_since AS p_waiting_since,
    p.next_action_task_id AS p_next_action_task_id,
    p.created_at AS p_created_at,
    p.last_changed_at AS p_last_changed_at,
    p.last_changed_by AS p_last_changed_by,
    p.notebook_pages AS p_notebook_pages,
    na.id AS next_action_id,
    na.title AS next_action_title
`;

const DONE_WHERE = `
  t.organization_id = ?
    AND t.project_id IS NOT NULL
    AND t.completed_at IS NOT NULL
    AND t.completed_at >= ?
    AND t.completed_at < ?
    AND t.deleted_at IS NULL
`;

const OTHER_COUNT_SQL = `
  SELECT COUNT(*) AS count
  FROM tasks
  WHERE organization_id = ?
    AND project_id IS NULL
    AND completed_at IS NOT NULL
    AND completed_at >= ?
    AND completed_at < ?
    AND deleted_at IS NULL
`;

export const createSqliteReviewStore = (db: Database): ReviewStore => ({
  pageReview: (options: PageReviewOptions) =>
    loadCandidates(db, options.organizationId).map((candidates) => {
      const ordered = buildReviewItems(candidates, {
        today: options.today,
        timeZone: options.timeZone,
      });
      return {
        ...pageOrdered({
          ordered,
          keysOf: reviewKeys,
          direction: reviewDirection,
          fetchLimit: options.fetchLimit,
          seek: options.seek,
        }),
        counts: countReviewReasons(ordered),
      };
    }),

  loadTimeZone: (organizationId: string) =>
    ResultAsync.fromPromise(
      db.execute({
        sql: `SELECT time_zone FROM organizations WHERE id = ?`,
        args: [organizationId],
      }),
      (cause) => storageError('Failed to load organization time zone', cause)
    ).andThen((result) => {
      const zone = result.rows[0]?.time_zone;
      if (typeof zone !== 'string' || zone.length === 0) {
        return result.rows.length === 0
          ? errAsync(storageError('Organization not found', { organizationId }))
          : okAsync(DEFAULT_VIEWER_TIME_ZONE);
      }
      return okAsync(zone);
    }),

  pageDoneList: (options: PageDoneListOptions) => {
    const whereArgs = [options.organizationId, options.completedAfter, options.completedBefore];
    return pageSqlite({
      db,
      from: DONE_FROM,
      selectSql: DONE_SELECT,
      whereSql: DONE_WHERE,
      whereArgs,
      orderSql: `ORDER BY t.completed_at DESC, t.id DESC`,
      keyColumns: ['t.completed_at', 't.id'],
      direction: doneListDirection,
      fetchLimit: options.fetchLimit,
      seek: options.seek,
      mapRow: (row) => row,
      errorMessage: 'Failed to list finished tasks this week',
    }).andThen((page) => {
      const parsed = Result.combine(page.rows.map(parseDoneListRow));
      if (parsed.isErr()) {
        return errAsync(parsed.error);
      }
      return ResultAsync.fromPromise(
        db.execute({
          sql: OTHER_COUNT_SQL,
          args: whereArgs,
        }),
        (cause) => storageError('Failed to count project-less finished tasks', cause)
      ).andThen((countResult) => {
        const other = Number(countResult.rows[0]?.count ?? 0);
        return ok({
          rows: parsed.value,
          total: page.total,
          otherTaskCount: Number.isFinite(other) ? other : 0,
        });
      });
    });
  },
});
