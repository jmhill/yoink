import { describe } from 'vitest';
import {
  REVIEW_TASK,
  reviewFixtureChangeLog,
  reviewFixtureProjects,
  reviewFixtureTasks,
  runReviewStoreContractTests,
} from '../domain/review-store.contract.js';
import { createFakeReviewStore } from './fake-review-store.js';

describe('FakeReviewStore', () => {
  runReviewStoreContractTests({
    createHarness: () => ({
      store: createFakeReviewStore({
        tasks: reviewFixtureTasks(),
        projects: reviewFixtureProjects(),
        changeLog: reviewFixtureChangeLog(),
        deletedTaskIds: [REVIEW_TASK.deleted],
      }),
    }),
  });
});
