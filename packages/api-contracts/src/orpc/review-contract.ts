import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import {
  DoneListPageSchema,
  DoneListQuerySchema,
  ReviewPageSchema,
  ReviewQuerySchema,
} from '../schemas/review.js';

/**
 * ts-rest parsed these queries with JSON.parse (`jsonQuery: true`).
 * `json` style is the same parse-or-keep-string rule.
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

export const reviewOrpcContract = oc.router({
  list: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/review',
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
        path: '/api/review/done',
        summary:
          'Tasks finished in a Monday–Sunday week in the stored org time zone, grouped by project.',
        queryStyles: doneQueryStyles,
      })
    )
    .input(DoneListQuerySchema)
    .output(DoneListPageSchema),
});
