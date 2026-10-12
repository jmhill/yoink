import { errAsync, okAsync, Result, ResultAsync } from 'neverthrow';
import type { Database } from '../../database/types.js';
import { pageOrdered } from '../../listing/domain/keyset-window.js';
import { reviewDirection, reviewKeys } from '../../listing/domain/list-keys.js';
import { buildReviewItems, type ReviewCandidate } from '../domain/build-review.js';
import { countReviewReasons } from '../domain/review-order.js';
import { storageError, type StorageError } from '../domain/review-errors.js';
import type { PageReviewOptions, ReviewStore } from '../domain/review-store.js';
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
});
