import type { ResultAsync } from 'neverthrow';
import type { ReviewCounts } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type { RankedReviewProject } from './review-order.js';
import type { DoneListRow } from './group-done.js';
import type { StorageError } from './review-errors.js';

export type PageReviewOptions = {
  organizationId: string;
  today: string;
  timeZone: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};

export type ReviewPageRows = KeysetRows<RankedReviewProject> & {
  counts: ReviewCounts;
};

export type ReviewChangeLogEntry = {
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly occurredAt: string;
};

export type PageDoneListOptions = {
  organizationId: string;
  completedAfter: string;
  completedBefore: string;
  fetchLimit: number;
  seek?: KeysetCursor;
};

export type DoneListPageRows = KeysetRows<DoneListRow> & {
  otherTaskCount: number;
};

export type ReviewStore = {
  pageReview(options: PageReviewOptions): ResultAsync<ReviewPageRows, StorageError>;
  loadTimeZone(organizationId: string): ResultAsync<string, StorageError>;
  pageDoneList(options: PageDoneListOptions): ResultAsync<DoneListPageRows, StorageError>;
};
