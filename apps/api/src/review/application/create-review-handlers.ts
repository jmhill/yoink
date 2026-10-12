import { handleListReview } from './handle-list-review.js';
import type { HandleListReviewDeps } from './handle-list-review.js';

export type ReviewHandlerDeps = HandleListReviewDeps;

export const createReviewHandlers = (deps: ReviewHandlerDeps) => ({
  list: (query: Parameters<typeof handleListReview>[0]) => handleListReview(query, deps),
});

export type ReviewHandlers = ReturnType<typeof createReviewHandlers>;
