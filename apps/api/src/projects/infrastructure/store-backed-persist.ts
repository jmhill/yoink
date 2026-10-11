import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { Database } from '../../database/types.js';
import {
  insertChangeLogIfChangedQuery,
  insertChangeLogQuery,
  type SqlQuery,
} from '../../shared/change-log/infrastructure/sql.js';
import type { FakeChangeLogStore } from '../../shared/change-log/infrastructure/fake-change-log-store.js';
import type { ChangeLogRecord } from '../../shared/change-log/domain/record.js';
import {
  duplicateProjectNameError,
  projectDoneError,
  storageError,
  type DuplicateProjectNameError,
  type ProjectDoneError,
  type StorageError,
} from '../domain/project-errors.js';
import type { PersistProjectChange, PersistSetNextAction } from '../application/ports.js';
import type { ProjectChangePlan } from '../domain/plan-project-change.js';
import { queriesForTaskPlan } from '../../tasks/infrastructure/store-backed-persist.js';
import type { FakeTaskStore } from '../../tasks/infrastructure/fake-task-store.js';
import type { TaskChangePlan } from '../../tasks/domain/plan-task-change.js';
import {
  clearNextActionQuery,
  insertProjectQuery,
  setNextActionQuery,
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
        ...plan.records.map((record) => insertChangeLogIfChangedQuery(record)),
      ];
    case 'setNextAction':
      return [
        setNextActionQuery({
          projectId: plan.projectId,
          organizationId: plan.organizationId,
          nextActionTaskId: plan.view.nextActionTaskId ?? '',
          lastChangedAt: plan.view.lastChangedAt,
          lastChangedBy: plan.view.lastChangedBy,
        }),
        ...plan.records.map((record) => insertChangeLogIfChangedQuery(record)),
      ];
  }
};

const projectDoneAborted = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /PROJECT_DONE/i.test(message);
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
}): PersistSetNextAction => {
  return (input) => {
    const projectQueries = queriesForProjectPlan(input.project);
    const taskQueries = input.tasks.flatMap((plan) => queriesForTaskPlan(plan));
    const setPlan =
      input.project.action === 'setNextAction' ? input.project : null;
    const cleanup = setPlan
      ? input.tasks.flatMap((plan) =>
          plan.action === 'insert'
            ? [
                {
                  sql: `
                      DELETE FROM change_log
                      WHERE subject_id = ? AND organization_id = ?
                        AND EXISTS (
                          SELECT 1 FROM projects
                          WHERE id = ? AND organization_id = ? AND status = 'done'
                        )
                    `,
                  args: [
                    plan.view.id,
                    plan.view.organizationId,
                    setPlan.projectId,
                    setPlan.organizationId,
                  ],
                },
                {
                  sql: `
                      DELETE FROM tasks
                      WHERE id = ? AND organization_id = ?
                        AND EXISTS (
                          SELECT 1 FROM projects
                          WHERE id = ? AND organization_id = ? AND status = 'done'
                        )
                    `,
                  args: [
                    plan.view.id,
                    plan.view.organizationId,
                    setPlan.projectId,
                    setPlan.organizationId,
                  ],
                },
              ]
            : []
        )
      : [];

    return ResultAsync.fromPromise(
      deps.db.batch([...taskQueries, ...projectQueries, ...cleanup], 'write'),
      (error): StorageError | ProjectDoneError => {
        if (projectDoneAborted(error) && input.project.action === 'setNextAction') {
          return projectDoneError(input.project.projectId);
        }
        return storageError('Failed to persist project status change', error);
      }
    ).andThen((results) => {
      if (
        input.project.action === 'setNextAction' &&
        (results[taskQueries.length]?.rowsAffected ?? 0) === 0
      ) {
        return errAsync(projectDoneError(input.project.projectId));
      }
      return okAsync(undefined);
    });
  };
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
    } else if (plan.action === 'clearNextAction') {
      if (
        !deps.store.applyClearNextAction({
          projectId: plan.projectId,
          previousTaskId: plan.previousTaskId,
          lastChangedAt: plan.view.lastChangedAt,
          lastChangedBy: plan.view.lastChangedBy,
        })
      ) {
        return okAsync(undefined);
      }
    } else if (plan.action === 'setNextAction') {
      if (
        !deps.store.applySetNextAction({
          projectId: plan.projectId,
          nextActionTaskId: plan.view.nextActionTaskId ?? '',
          lastChangedAt: plan.view.lastChangedAt,
          lastChangedBy: plan.view.lastChangedBy,
        })
      ) {
        return okAsync(undefined);
      }
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
}): PersistSetNextAction => {
  return (input) => {
    const restoreProject = deps.projects.captureSnapshot();
    const restoreTasks = deps.tasks.captureSnapshot();
    const restoreLog = deps.changeLog.captureSnapshot();

    let projectRecords = input.project.records;
    if (input.project.action === 'insert') {
      deps.projects.applyInsert(input.project.view);
    } else if (input.project.action === 'clearNextAction') {
      const applied = deps.projects.applyClearNextAction({
        projectId: input.project.projectId,
        previousTaskId: input.project.previousTaskId,
        lastChangedAt: input.project.view.lastChangedAt,
        lastChangedBy: input.project.view.lastChangedBy,
      });
      if (!applied) {
        projectRecords = [];
      }
    } else if (input.project.action === 'setNextAction') {
      const applied = deps.projects.applySetNextAction({
        projectId: input.project.projectId,
        nextActionTaskId: input.project.view.nextActionTaskId ?? '',
        lastChangedAt: input.project.view.lastChangedAt,
        lastChangedBy: input.project.view.lastChangedBy,
      });
      if (!applied) {
        return errAsync(projectDoneError(input.project.projectId));
      }
    } else {
      deps.projects.applyReplace(input.project.view);
    }

    for (const plan of input.tasks) {
      applyTaskPlanToStore(deps.tasks, plan);
    }

    const records = [
      ...input.tasks.flatMap((plan) => plan.records),
      ...projectRecords,
    ];

    return persistRecords(deps.changeLog, records).mapErr((error) => {
      restoreProject();
      restoreTasks();
      restoreLog();
      return error;
    });
  };
};
