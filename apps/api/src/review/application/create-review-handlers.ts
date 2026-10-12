import { handleListDone } from './handle-list-done.js';
import type { HandleListDoneDeps } from './handle-list-done.js';
import { handleListReview } from './handle-list-review.js';
import type { HandleListReviewDeps } from './handle-list-review.js';

export type ReviewHandlerDeps = HandleListReviewDeps & HandleListDoneDeps;

export const createReviewHandlers = (deps: ReviewHandlerDeps) => ({
  list: (query: Parameters<typeof handleListReview>[0]) => handleListReview(query, deps),
  done: (query: Parameters<typeof handleListDone>[0]) => handleListDone(query, deps),
});

export type ReviewHandlers = ReturnType<typeof createReviewHandlers>;
