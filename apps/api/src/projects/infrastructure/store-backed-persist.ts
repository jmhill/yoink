import { okAsync, ResultAsync } from 'neverthrow';
import type { Database } from '../../database/types.js';
import { insertChangeLogQuery, type SqlQuery } from '../../shared/change-log/infrastructure/sql.js';
import type { FakeChangeLogStore } from '../../shared/change-log/infrastructure/fake-change-log-store.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import {
  duplicateProjectNameError,
  storageError,
  type DuplicateProjectNameError,
  type StorageError,
} from '../domain/project-errors.js';
import type { PersistProjectChange, PersistProjectStatusChange } from '../application/ports.js';
import type { ProjectChangePlan } from '../domain/plan-project-change.js';
import { queriesForTaskPlan } from '../../tasks/infrastructure/store-backed-persist.js';
import type { FakeTaskStore } from '../../tasks/infrastructure/fake-task-store.js';
import type { TaskChangePlan } from '../../tasks/domain/plan-task-change.js';
import {
  clearNextActionQuery,
  insertProjectQuery,
  updateProjectQuery,
} from './project-row-statements.js';
import type { FakeProjectStore } from './fake-project-store.js';

export const queriesForProjectPlan = (plan: ProjectChangePlan): SqlQuery[] => {
  const history = plan.records.map((record) => insertChangeLogQuery(record));

  switch (plan.action) {
    case 'insert':
      return [insertProjectQuery(plan.view), ...history];
    case 'update':
      return [updateProjectQuery(plan.view), ...history];
    case 'clearNextAction':
      return [
        clearNextActionQuery({
          projectId: plan.projectId,
          organizationId: plan.organizationId,
          previousTaskId: plan.previousTaskId,
          lastChangedAt: plan.view.lastChangedAt,
          lastChangedBy: plan.view.lastChangedBy,
        }),
        ...history,
      ];
  }
};

const uniqueNameConstraintFailed = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /idx_projects_org_name_ci/i.test(message);
};

const persistFailure = (
  plan: ProjectChangePlan,
  error: unknown
): StorageError | DuplicateProjectNameError => {
  if (uniqueNameConstraintFailed(error)) {
    return duplicateProjectNameError(plan.view.name);
  }
  return storageError('Failed to persist project change', error);
};

export const createSqliteProjectPersist = (deps: {
  db: Database;
}): PersistProjectChange => {
  return (plan) =>
    ResultAsync.fromPromise(
      deps.db.batch(queriesForProjectPlan(plan), 'write'),
      (error) => persistFailure(plan, error)
    ).map(() => undefined);
};

export const createSqliteProjectStatusPersist = (deps: {
  db: Database;
}): PersistProjectStatusChange => {
  return (input) =>
    ResultAsync.fromPromise(
      deps.db.batch(
        [
          ...input.tasks.flatMap((plan) => queriesForTaskPlan(plan)),
          ...queriesForProjectPlan(input.project),
        ],
        'write'
      ),
      (error) => storageError('Failed to persist project status change', error)
    ).map(() => undefined);
};

const persistRecords = (
  changeLog: FakeChangeLogStore,
  records: readonly ChangeLogRecord[]
): ResultAsync<void, StorageError> =>
  records.reduce(
    (chain, record) =>
      chain.andThen(() =>
        changeLog.insert(record).mapErr((error) =>
          error.type === 'STORAGE_ERROR' ? error : storageError(error.message)
        )
      ),
    okAsync<void, StorageError>(undefined)
  );

const applyTaskPlanToStore = (store: FakeTaskStore, plan: TaskChangePlan): void => {
  switch (plan.action) {
    case 'insert':
      store.applyInsert(plan.view);
      return;
    case 'update':
    case 'uncomplete':
      store.applyReplace(plan.view);
      return;
    case 'delete':
      store.applySoftDelete(plan.taskId);
      return;
  }
};

export const createStoreBackedProjectPersist = (deps: {
  store: FakeProjectStore;
  changeLog: FakeChangeLogStore;
}): PersistProjectChange => {
  return (plan) => {
    const restoreProject = deps.store.captureSnapshot();
    const restoreLog = deps.changeLog.captureSnapshot();
    if (plan.action === 'insert') {
      deps.store.applyInsert(plan.view);
    } else {
      deps.store.applyReplace(plan.view);
    }
    return persistRecords(deps.changeLog, plan.records).mapErr((error) => {
      restoreProject();
      restoreLog();
      return error;
    });
  };
};

export const createStoreBackedProjectStatusPersist = (deps: {
  projects: FakeProjectStore;
  tasks: FakeTaskStore;
  changeLog: FakeChangeLogStore;
}): PersistProjectStatusChange => {
  return (input) => {
    const restoreProject = deps.projects.captureSnapshot();
    const restoreTasks = deps.tasks.captureSnapshot();
    const restoreLog = deps.changeLog.captureSnapshot();

    for (const plan of input.tasks) {
      applyTaskPlanToStore(deps.tasks, plan);
    }
    if (input.project.action === 'insert') {
      deps.projects.applyInsert(input.project.view);
    } else {
      deps.projects.applyReplace(input.project.view);
    }

    const records = [
      ...input.tasks.flatMap((plan) => plan.records),
      ...input.project.records,
    ];

    return persistRecords(deps.changeLog, records).mapErr((error) => {
      restoreProject();
      restoreTasks();
      restoreLog();
      return error;
    });
  };
};
