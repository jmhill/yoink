import type { ResultAsync } from 'neverthrow';
import type { StorageError } from '../domain/review-errors.js';
import type { PageReviewOptions, ReviewPageRows } from '../domain/review-store.js';

export type PageReview = (
  options: PageReviewOptions
) => ResultAsync<ReviewPageRows, StorageError>;
