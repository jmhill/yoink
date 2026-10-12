import { errAsync, ok, type ResultAsync } from 'neverthrow';
import type { ReviewCounts } from '@yoink/api-contracts';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { reviewCursor } from '../../listing/domain/list-keys.js';
import { assembleListedPage, type ListedPage } from '../../listing/domain/listed-page.js';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../listing/application/keyset-codec.js';
import {
  DEFAULT_VIEWER_TIME_ZONE,
  resolveViewerToday,
} from '../../shared/domain/viewer-today.js';
import type { ListReviewQuery } from '../domain/review-queries.js';
import type { ListReviewError } from '../domain/review-errors.js';
import type { RankedReviewProject } from '../domain/review-order.js';
import type { PageReview } from './ports.js';

export type HandleListReviewDeps = {
  pageReview: PageReview;
  now: () => Date;
};

export type ReviewListedPage = ListedPage<RankedReviewProject> & {
  today: string;
  counts: ReviewCounts;
};

export const handleListReview = (
  query: ListReviewQuery,
  deps: HandleListReviewDeps
): ResultAsync<ReviewListedPage, ListReviewError> => {
  const timeZone = query.timeZone ?? DEFAULT_VIEWER_TIME_ZONE;
  const today = resolveViewerToday({
    now: deps.now(),
    timeZone: query.timeZone,
  });
  const limit = resolveListLimit(query.limit, 'pile');
  const seekResult =
    query.cursor === undefined
      ? ok(undefined)
      : decodeKeysetCursor(query.cursor, reviewCursor.view);

  return seekResult.match(
    (seek) =>
      deps
        .pageReview({
          organizationId: query.organizationId,
          today,
          timeZone,
          fetchLimit: limit + 1,
          seek,
        })
        .map((loaded) => {
          const assembled = assembleListedPage({
            rows: loaded.rows,
            total: loaded.total,
            limit,
            cursorOf: reviewCursor.of,
          });
          return {
            items: assembled.items,
            hasMore: assembled.hasMore,
            nextCursor: assembled.next === null ? null : encodeKeysetCursor(assembled.next),
            total: assembled.total,
            today,
            counts: loaded.counts,
          };
        }),
    (error) => errAsync(error)
  );
};
