import { describe } from 'vitest';
import {
  runWorkStoreContractTests,
  workFixtureLists,
  workFixtureProjects,
  workFixtureTasks,
  WORK_TASK,
} from '../domain/work-store.contract.js';
import { createFakeWorkStore } from './fake-work-store.js';

describe('FakeWorkStore', () => {
  runWorkStoreContractTests({
    createHarness: () => ({
      store: createFakeWorkStore({
        tasks: workFixtureTasks(),
        projects: workFixtureProjects(),
        lists: workFixtureLists(),
        deletedTaskIds: [WORK_TASK.deletedLoose],
      }),
    }),
  });
});
