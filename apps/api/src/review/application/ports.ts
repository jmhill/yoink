import type { ResultAsync } from 'neverthrow';
import type { ReviewCounts } from '@yoink/api-contracts';
import type { KeysetRows } from '../../listing/domain/listed-page.js';
import type { RankedReviewProject } from '../domain/review-order.js';
import type { CountReviewOptions, PageReviewOptions } from '../domain/review-store.js';
import type { StorageError } from '../domain/review-errors.js';

export type PageReview = (
  options: PageReviewOptions
) => ResultAsync<KeysetRows<RankedReviewProject>, StorageError>;

export type CountReview = (
  options: CountReviewOptions
) => ResultAsync<ReviewCounts, StorageError>;
