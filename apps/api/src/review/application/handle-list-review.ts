import { ResultAsync } from 'neverthrow';
import type { ReviewCounts } from '@yoink/api-contracts';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { reviewCursor } from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import {
  DEFAULT_VIEWER_TIME_ZONE,
  resolveViewerToday,
} from '../../shared/domain/viewer-today.js';
import type { ListReviewQuery } from '../domain/review-queries.js';
import type { ListReviewError } from '../domain/review-errors.js';
import type { RankedReviewProject } from '../domain/review-order.js';
import type { CountReview, PageReview } from './ports.js';

export type HandleListReviewDeps = {
  pageReview: PageReview;
  countReview: CountReview;
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
  return ResultAsync.combine([
    runListedQuery({
      cursor: query.cursor,
      cursorOf: reviewCursor,
      limit: resolveListLimit(query.limit, 'pile'),
      load: (seek, fetchLimit) =>
        deps.pageReview({
          organizationId: query.organizationId,
          today,
          timeZone,
          fetchLimit,
          seek,
        }),
    }),
    deps.countReview({
      organizationId: query.organizationId,
      today,
      timeZone,
    }),
  ]).map(([page, counts]) => ({
    ...page,
    today,
    counts,
  }));
};
