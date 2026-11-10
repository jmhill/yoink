import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { Database, QueryResult } from '../../../../platform/database/types.js';
import {
  insertChangeLogIfChangedQuery,
  insertChangeLogQuery,
} from '../../../history/infrastructure/sql.js';
import type { FakeChangeLogStore } from '../../../history/infrastructure/fake-change-log-store.js';
import type { PersistTaskChange } from '../../application/ports.js';
import type { TaskChangePlan } from '../../domain/projections/plan-task-change.js';
import { storageError, taskNotFoundError } from '../../domain/messages/task-errors.js';
import type { StorageError, TaskNotFoundError } from '../../domain/messages/task-errors.js';
import type { FakeTaskStore } from '../fakes/fake-task-store.js';
import type { ProjectChangePlan } from '../../domain/projections/plan-project-change.js';
import {
  clearNextActionQuery,
  insertProjectQuery,
  setNextActionQuery,
  updateProjectQuery,
} from './rows/project-row-statements.js';
import type { FakeProjectStore } from '../fakes/fake-project-store.js';
import {
  insertTaskQuery,
  setOpenOrderQueries,
  softDeleteTaskQuery,
  updateTaskQuery,
} from './rows/task-row-statements.js';

const historyAfterInsert = (plan: TaskChangePlan) =>
  plan.records.map((record) => insertChangeLogQuery(record));

const historyAfterChange = (plan: TaskChangePlan) =>
  plan.records.map((record) => insertChangeLogIfChangedQuery(record));

export const queriesForTaskPlan = (plan: TaskChangePlan) => {
  switch (plan.action) {
    case 'insert':
      return [insertTaskQuery(plan.view), ...historyAfterInsert(plan)];
    case 'update':
      return [updateTaskQuery(plan.view), ...historyAfterChange(plan)];
    case 'uncomplete':
      return [
        updateTaskQuery(plan.view),
        ...historyAfterChange(plan),
        ...setOpenOrderQueries(
          plan.organizationId,
          plan.siblingOrders,
          plan.view.id
        ),
      ];
    case 'delete':
      return [
        softDeleteTaskQuery(plan.taskId, plan.organizationId, plan.deletedAt),
        ...historyAfterChange(plan),
      ];
  }
};

const subjectIdOf = (plan: TaskChangePlan): string =>
  plan.action === 'delete' ? plan.taskId : plan.view.id;

const queriesForProjectExtra = (project: ProjectChangePlan) => {
  const written = project.records.map((record) => insertChangeLogQuery(record));
  const changed = project.records.map((record) => insertChangeLogIfChangedQuery(record));
  switch (project.action) {
    case 'insert':
      return [insertProjectQuery(project.view), ...written];
    case 'update':
      return [updateProjectQuery(project.view), ...changed];
    case 'clearNextAction':
      return [
        clearNextActionQuery({
          projectId: project.projectId,
          organizationId: project.organizationId,
          previousTaskId: project.previousTaskId,
          lastChangedAt: project.view.lastChangedAt,
          lastChangedBy: project.view.lastChangedBy,
        }),
        ...project.records.map((record) => insertChangeLogIfChangedQuery(record)),
      ];
    case 'setNextAction':
      return [
        setNextActionQuery({
          projectId: project.projectId,
          organizationId: project.organizationId,
          nextActionTaskId: project.view.nextActionTaskId ?? '',
          lastChangedAt: project.view.lastChangedAt,
          lastChangedBy: project.view.lastChangedBy,
        }),
        ...project.records.map((record) => insertChangeLogIfChangedQuery(record)),
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
    case 'delete':
      return (results[0]?.rowsAffected ?? 0) === 0;
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

export type FakeTaskPersistDeps = {
  store: FakeTaskStore;
  changeLog: FakeChangeLogStore;
  projects?: FakeProjectStore;
};

/**
 * In-memory persist: apply the plan's row mutations and history in one snapshot
 * so a failing change-log insert leaves the task unchanged.
 * A source capture is deleted by the processing policy, not here.
 */
const applyProjectPlan = (
  projects: FakeProjectStore | undefined,
  project: ProjectChangePlan | undefined
): ResultAsync<boolean, StorageError> => {
  if (!project) {
    return okAsync(false);
  }
  if (!projects) {
    return errAsync(storageError('Project persist is not configured'));
  }
  if (project.action === 'insert') {
    projects.applyInsert(project.view);
    return okAsync(true);
  }
  if (project.action === 'clearNextAction') {
    return okAsync(
      projects.applyClearNextAction({
        projectId: project.projectId,
        previousTaskId: project.previousTaskId,
        lastChangedAt: project.view.lastChangedAt,
        lastChangedBy: project.view.lastChangedBy,
      })
    );
  }
  if (project.action === 'setNextAction') {
    return okAsync(
      projects.applySetNextAction({
        projectId: project.projectId,
        nextActionTaskId: project.view.nextActionTaskId ?? '',
        lastChangedAt: project.view.lastChangedAt,
        lastChangedBy: project.view.lastChangedBy,
      })
    );
  }
  if (!projects.hasActive(project.view.id)) {
    return errAsync(storageError('Project not found'));
  }
  projects.applyReplace(project.view);
  return okAsync(true);
};

export const createStoreBackedPersist = (deps: FakeTaskPersistDeps): PersistTaskChange => {
  const { store, changeLog, projects } = deps;

  return (plan, extras) => {
    const restoreTask = store.captureSnapshot();
    const restoreLog = changeLog.captureSnapshot();
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
      .andThen((applied) => (applied ? persistProjectRecords() : okAsync(undefined)))
      .mapErr((error) => {
        restoreTask();
        restoreLog();
        restoreProjects?.();
        return error;
      });
  };
};
