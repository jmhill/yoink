import { describe } from 'vitest';
import {
  DONE_TASK,
  doneFixtureProjects,
  doneFixtureTasks,
  runDoneListStoreContractTests,
} from '../domain/done-list-store.contract.js';
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

  runDoneListStoreContractTests({
    createHarness: () => ({
      store: createFakeReviewStore({
        tasks: doneFixtureTasks(),
        projects: doneFixtureProjects(),
        deletedTaskIds: [DONE_TASK.deleted],
      }),
    }),
  });
});
