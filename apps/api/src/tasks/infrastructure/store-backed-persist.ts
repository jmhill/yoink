import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { Database, QueryResult } from '../../database/types.js';
import { insertChangeLogQuery } from '../../shared/change-log/infrastructure/sql.js';
import type { FakeChangeLogStore } from '../../shared/change-log/infrastructure/fake-change-log-store.js';
import type { PersistTaskChange } from '../application/ports.js';
import type { TaskChangePlan } from '../domain/plan-task-change.js';
import { storageError, taskNotFoundError } from '../domain/task-errors.js';
import type { StorageError, TaskNotFoundError } from '../domain/task-errors.js';
import type { FakeTaskStore } from './fake-task-store.js';
import type { ProjectChangePlan } from '../../projects/domain/plan-project-change.js';
import {
  clearNextActionQuery,
  insertProjectQuery,
  updateProjectQuery,
} from '../../projects/infrastructure/project-row-statements.js';
import type { FakeProjectStore } from '../../projects/infrastructure/fake-project-store.js';
import {
  insertTaskQuery,
  setOpenOrderQueries,
  softDeleteCaptureQuery,
  softDeleteTaskQuery,
  updateTaskQuery,
} from './task-row-statements.js';

const historyQueries = (plan: TaskChangePlan) =>
  plan.action === 'uncomplete'
    ? plan.records.map((record) =>
        insertChangeLogQuery(record, {
          id: plan.view.id,
          organizationId: plan.organizationId,
        })
      )
    : plan.records.map((record) => insertChangeLogQuery(record));

export const queriesForTaskPlan = (plan: TaskChangePlan) => {
  const history = historyQueries(plan);

  switch (plan.action) {
    case 'insert':
      return [insertTaskQuery(plan.view), ...history];
    case 'update':
      return [updateTaskQuery(plan.view), ...history];
    case 'uncomplete':
      return [
        updateTaskQuery(plan.view),
        ...setOpenOrderQueries(
          plan.organizationId,
          plan.siblingOrders,
          plan.view.id
        ),
        ...history,
      ];
    case 'delete': {
      const queries = [...history, softDeleteTaskQuery(plan.taskId, plan.organizationId, plan.deletedAt)];
      if (plan.captureId) {
        queries.push(
          softDeleteCaptureQuery(plan.captureId, plan.organizationId, plan.deletedAt)
        );
      }
      return queries;
    }
  }
};

const subjectIdOf = (plan: TaskChangePlan): string =>
  plan.action === 'delete' ? plan.taskId : plan.view.id;

const queriesForProjectExtra = (project: ProjectChangePlan) => {
  const history = project.records.map((record) => insertChangeLogQuery(record));
  switch (project.action) {
    case 'insert':
      return [insertProjectQuery(project.view), ...history];
    case 'update':
      return [updateProjectQuery(project.view), ...history];
    case 'clearNextAction':
      return [
        clearNextActionQuery({
          projectId: project.projectId,
          organizationId: project.organizationId,
          previousTaskId: project.previousTaskId,
          lastChangedAt: project.view.lastChangedAt,
          lastChangedBy: project.view.lastChangedBy,
        }),
        ...history,
      ];
  }
};

const mutationMissed = (plan: TaskChangePlan, results: QueryResult[]): boolean => {
  switch (plan.action) {
    case 'insert':
      return false;
    case 'update':
    case 'uncomplete':
      return (results[0]?.rowsAffected ?? 0) === 0;
    case 'delete': {
      const history = results[0];
      const softDelete = results[plan.records.length];
      return (history?.rowsAffected ?? 0) === 0 || (softDelete?.rowsAffected ?? 0) === 0;
    }
  }
};

export const createSqliteTaskPersist = (deps: { db: Database }): PersistTaskChange => {
  return (plan, extras) =>
    ResultAsync.fromPromise(
      deps.db.batch(
        [
          ...queriesForTaskPlan(plan),
          ...(extras?.project ? queriesForProjectExtra(extras.project) : []),
        ],
        'write'
      ),
      (error) => storageError('Failed to persist task change', error)
    ).andThen((results) =>
      mutationMissed(plan, results)
        ? errAsync(taskNotFoundError(subjectIdOf(plan)))
        : okAsync(undefined)
    );
};

export type CaptureSideEffects = {
  captureSnapshot: () => () => void;
  applySoftDelete: (id: string) => void;
};

export type FakeTaskPersistDeps = {
  store: FakeTaskStore;
  changeLog: FakeChangeLogStore;
  captures: CaptureSideEffects;
  projects?: FakeProjectStore;
};

/**
 * In-memory persist: apply the plan's row mutations and history in one snapshot
 * so a failing change-log insert leaves the task (and capture) unchanged.
 */
const applyProjectPlan = (
  projects: FakeProjectStore | undefined,
  project: ProjectChangePlan | undefined
): ResultAsync<void, StorageError> => {
  if (!project) {
    return okAsync(undefined);
  }
  if (!projects) {
    return errAsync(storageError('Project persist is not configured'));
  }
  if (project.action === 'insert') {
    projects.applyInsert(project.view);
    return okAsync(undefined);
  }
  if (!projects.hasActive(project.view.id)) {
    return errAsync(storageError('Project not found'));
  }
  projects.applyReplace(project.view);
  return okAsync(undefined);
};

export const createStoreBackedPersist = (deps: FakeTaskPersistDeps): PersistTaskChange => {
  const { store, changeLog, captures, projects } = deps;

  return (plan, extras) => {
    const restoreTask = store.captureSnapshot();
    const restoreLog = changeLog.captureSnapshot();
    const restoreCaptures = captures.captureSnapshot();
    const restoreProjects = projects?.captureSnapshot();

    const persistRecords = (): ResultAsync<void, StorageError> =>
      plan.records.reduce(
        (chain, record) =>
          chain.andThen(() =>
            changeLog.insert(record).mapErr((error) =>
              error.type === 'STORAGE_ERROR' ? error : storageError(error.message)
            )
          ),
        okAsync<void, StorageError>(undefined)
      );

    const missing = (): ResultAsync<void, TaskNotFoundError> =>
      errAsync(taskNotFoundError(subjectIdOf(plan)));

    const run = (): ResultAsync<void, StorageError | TaskNotFoundError> => {
      switch (plan.action) {
        case 'insert':
          store.applyInsert(plan.view);
          return persistRecords();
        case 'update':
          if (!store.hasActive(plan.view.id)) {
            return missing();
          }
          store.applyReplace(plan.view);
          return persistRecords();
        case 'uncomplete':
          if (!store.hasActive(plan.view.id)) {
            return missing();
          }
          store.applyReplace(plan.view);
          store.applySetOpenOrders(plan.siblingOrders);
          return persistRecords();
        case 'delete':
          if (!store.hasActive(plan.taskId)) {
            return missing();
          }
          store.applySoftDelete(plan.taskId);
          if (plan.captureId) {
            captures.applySoftDelete(plan.captureId);
          }
          return persistRecords();
      }
    };

    const persistProjectRecords = (): ResultAsync<void, StorageError> => {
      const projectRecords = extras?.project?.records ?? [];
      return projectRecords.reduce(
        (chain, record) =>
          chain.andThen(() =>
            changeLog.insert(record).mapErr((error) =>
              error.type === 'STORAGE_ERROR' ? error : storageError(error.message)
            )
          ),
        okAsync<void, StorageError>(undefined)
      );
    };

    return run()
      .andThen(() => applyProjectPlan(projects, extras?.project))
      .andThen(() => persistProjectRecords())
      .mapErr((error) => {
        restoreTask();
        restoreLog();
        restoreCaptures();
        restoreProjects?.();
        return error;
      });
  };
};
