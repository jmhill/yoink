import type { ResultAsync } from 'neverthrow';
import type { StorageError } from '../domain/review-errors.js';
import type {
  DoneListPageRows,
  PageDoneListOptions,
  PageReviewOptions,
  ReviewPageRows,
} from '../domain/review-store.js';

export type PageReview = (
  options: PageReviewOptions
) => ResultAsync<ReviewPageRows, StorageError>;

export type LoadOrganizationTimeZone = (
  organizationId: string
) => ResultAsync<string, StorageError>;

export type PageDoneList = (
  options: PageDoneListOptions
) => ResultAsync<DoneListPageRows, StorageError>;

export type LoadCompletedByNames = (
  userIds: readonly string[]
) => ResultAsync<(userId: string) => string, StorageError>;
