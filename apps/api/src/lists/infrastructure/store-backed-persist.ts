import { okAsync, ResultAsync } from 'neverthrow';
import type { Database } from '../../database/types.js';
import { insertChangeLogQuery, type SqlQuery } from '../../shared/change-log/infrastructure/sql.js';
import type { FakeChangeLogStore } from '../../shared/change-log/infrastructure/fake-change-log-store.js';
import { storageError, type StorageError } from '../domain/list-errors.js';
import type { PersistNamedListChange } from '../application/ports.js';
import type { ListChangePlan } from '../domain/plan-list-change.js';
import type { FakeListStore } from './fake-list-store.js';
import {
  insertListQuery,
  removeListQuery,
  updateListNameQuery,
} from './list-row-statements.js';

export type ListTaskSql = {
  clearCompletedListId: (listId: string, organizationId: string) => SqlQuery;
  setOpenOrders: (
    organizationId: string,
    orders: { id: string; openOrder: number }[]
  ) => SqlQuery[];
};

const queriesForPlan = (plan: ListChangePlan, taskSql: ListTaskSql): SqlQuery[] => {
  const history = plan.records.map(insertChangeLogQuery);

  switch (plan.action) {
    case 'insert':
      return [insertListQuery(plan.view), ...history];
    case 'rename':
      return [
        updateListNameQuery(plan.listId, plan.organizationId, plan.name),
        ...history,
      ];
    case 'delete':
      return [
        ...history,
        taskSql.clearCompletedListId(plan.listId, plan.organizationId),
        removeListQuery(plan.listId, plan.organizationId),
      ];
    case 'reorder':
      return [...taskSql.setOpenOrders(plan.organizationId, plan.orders), ...history];
  }
};

export const createSqliteListPersist = (deps: {
  db: Database;
  taskSql: ListTaskSql;
}): PersistNamedListChange => {
  return (plan) =>
    ResultAsync.fromPromise(
      deps.db.batch(queriesForPlan(plan, deps.taskSql), 'write'),
      (error) => storageError('Failed to persist list change', error)
    ).map(() => undefined);
};

export type ListTaskSideEffects = {
  captureSnapshot: () => () => void;
  applyClearListIdOnCompleted: (listId: string) => void;
  applySetOpenOrders: (orders: { id: string; openOrder: number }[]) => void;
};

export type StoreBackedPersistDeps = {
  store: FakeListStore;
  changeLog: FakeChangeLogStore;
  tasks: ListTaskSideEffects;
};

export const createStoreBackedPersist = ({
  store,
  changeLog,
  tasks,
}: StoreBackedPersistDeps): PersistNamedListChange => {
  return (plan) => {
    const restoreList = store.captureSnapshot();
    const restoreLog = changeLog.captureSnapshot();
    const restoreTasks = tasks.captureSnapshot();

    const persistRecords = (): ResultAsync<void, StorageError> =>
      plan.records.reduce(
        (chain, record) =>
          chain.andThen(() =>
            changeLog.insert(record).mapErr((error) =>
              error.type === 'STORAGE_ERROR' ? error : storageError(error.message)
            )
          ),
        okAsync(undefined) as ResultAsync<void, StorageError>
      );

    const run = (): ResultAsync<void, StorageError> => {
      switch (plan.action) {
        case 'insert':
          store.applyInsert(plan.view);
          return persistRecords();
        case 'rename':
          store.applyReplace(plan.view);
          return persistRecords();
        case 'delete':
          tasks.applyClearListIdOnCompleted(plan.listId);
          store.applyRemove(plan.listId);
          return persistRecords();
        case 'reorder':
          tasks.applySetOpenOrders(plan.orders);
          return persistRecords();
      }
    };

    return run().mapErr((error) => {
      restoreList();
      restoreLog();
      restoreTasks();
      return error;
    });
  };
};
