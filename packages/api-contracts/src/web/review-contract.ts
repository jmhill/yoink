import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import {
  DoneListPageSchema,
  DoneListQuerySchema,
  ReviewPageSchema,
  ReviewQuerySchema,
} from '../schemas/review.js';

/**
 * Query values are JSON-parsed (`queryStyles: 'json'`), so numbers stay
 * numbers and `false` stays false.
 */
const reviewQueryStyles = {
  limit: 'json',
  cursor: 'json',
  timeZone: 'json',
} as const;

const doneQueryStyles = {
  limit: 'json',
  cursor: 'json',
  week: 'json',
} as const;

/**
 * Review list and done list. Paths are the resource after `/web-api`.
 * The same reads stay on `/api` and `/api/v1` at `/review` and `/review/done`.
 * Both edges call one Review query and do not re-sort the page.
 */
export const webReviewContract = oc.router({
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/review',
        summary:
          'Projects that need attention: active with no next action, active with no change in 7 days, and every waiting project.',
        queryStyles: reviewQueryStyles,
      })
    )
    .input(ReviewQuerySchema)
    .output(ReviewPageSchema),
  done: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/review/done',
        summary:
          'Tasks finished in a Monday–Sunday week in the stored org time zone, grouped by project.',
        queryStyles: doneQueryStyles,
      })
    )
    .input(DoneListQuerySchema)
    .output(DoneListPageSchema),
});
