import type { ResultAsync } from 'neverthrow';
import type { ReviewCounts } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type { RankedReviewProject } from './review-order.js';
import type { StorageError } from './review-errors.js';

export type PageReviewOptions = {
  organizationId: string;
  today: string;
  timeZone: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};

export type CountReviewOptions = {
  organizationId: string;
  today: string;
  timeZone: string;
};

export type ReviewChangeLogEntry = {
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly occurredAt: string;
};

export type ReviewStore = {
  pageReview(
    options: PageReviewOptions
  ): ResultAsync<KeysetRows<RankedReviewProject>, StorageError>;
  countReview(options: CountReviewOptions): ResultAsync<ReviewCounts, StorageError>;
};
