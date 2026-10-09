import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { Database } from '../../database/types.js';
import { insertChangeLogQuery, type SqlQuery } from '../../shared/change-log/infrastructure/sql.js';
import type { FakeChangeLogStore } from '../../shared/change-log/infrastructure/fake-change-log-store.js';
import { applyNamedListEvent } from '../domain/apply-named-list-event.js';
import { changeLogRecordsFromListEvent } from '../domain/change-log-records.js';
import { storageError, type StorageError } from '../domain/list-errors.js';
import type {
  ClearCompletedListIds,
  PersistNamedListEvent,
  PersistOpenTaskOrders,
} from '../application/ports.js';
import type { ListStore } from '../domain/list-store.js';
import {
  insertListQuery,
  removeListQuery,
  updateListQuery,
} from './list-row-statements.js';

export type ListPersistSideQueries = {
  clearCompletedListIdQuery: (listId: string) => SqlQuery;
  setOpenOrderQueries: (updates: { id: string; openOrder: number }[]) => SqlQuery[];
};

export const createSqliteListPersist = (deps: {
  db: Database;
  nextId: () => string;
  sideQueries: ListPersistSideQueries;
}): PersistNamedListEvent => {
  return (input) => {
    const { event, actor, now } = input;
    const history = changeLogRecordsFromListEvent({
      event,
      actor,
      now,
      nextId: deps.nextId,
    }).map(insertChangeLogQuery);

    let queries: SqlQuery[] | null = null;

    switch (event.type) {
      case 'NamedListCreated': {
        const view = applyNamedListEvent(null, event);
        if (!view) {
          return errAsync(storageError('Create did not project a list'));
        }
        queries = [insertListQuery(view), ...history];
        break;
      }
      case 'NamedListRenamed':
        queries = [
          updateListQuery({
            id: event.id,
            organizationId: event.organizationId,
            createdById: event.organizationId,
            name: event.name,
            createdAt: now,
          }),
          ...history,
        ];
        break;
      case 'NamedListDeleted':
        queries = [
          deps.sideQueries.clearCompletedListIdQuery(event.id),
          removeListQuery(event.id),
          ...history,
        ];
        break;
      case 'OpenTasksReordered':
        queries = [...deps.sideQueries.setOpenOrderQueries(event.orders), ...history];
        break;
    }

    if (!queries) {
      return errAsync(storageError(`Cannot persist ${event.type}`));
    }

    return ResultAsync.fromPromise(
      deps.db.batch(queries, 'write'),
      (error) => storageError('Failed to persist list change', error)
    );
  };
};

export type StoreBackedPersistDeps = {
  store: ListStore & { captureSnapshot?: () => () => void };
  clearCompletedListIds: ClearCompletedListIds;
  persistOpenTaskOrders?: PersistOpenTaskOrders;
  changeLog?: FakeChangeLogStore;
  nextId?: () => string;
};

export const createStoreBackedPersist = ({
  store,
  clearCompletedListIds,
  persistOpenTaskOrders,
  changeLog,
  nextId,
}: StoreBackedPersistDeps): PersistNamedListEvent => {
  return (input) => {
    const { event, actor, now } = input;
    const restoreList = store.captureSnapshot?.() ?? (() => undefined);
    const restoreLog = changeLog?.captureSnapshot() ?? (() => undefined);

    const persistRecords = (): ResultAsync<void, StorageError> => {
      if (!changeLog || !nextId) {
        return okAsync(undefined);
      }
      const records = changeLogRecordsFromListEvent({
        event,
        actor,
        now,
        nextId,
      });
      return records.reduce(
        (chain, record) =>
          chain.andThen(() =>
            changeLog.insert(record).mapErr((error) =>
              error.type === 'STORAGE_ERROR'
                ? error
                : storageError(error.message)
            )
          ),
        okAsync(undefined) as ResultAsync<void, StorageError>
      );
    };

    const run = (): ResultAsync<void, StorageError> => {
      switch (event.type) {
        case 'NamedListCreated': {
          const view = applyNamedListEvent(null, event);
          if (!view) {
            return errAsync(storageError('Create did not project a list'));
          }
          return store.save(view).andThen(persistRecords);
        }
        case 'NamedListDeleted':
          return clearCompletedListIds(event.id)
            .andThen(() => store.remove(event.id))
            .andThen(persistRecords);
        case 'NamedListRenamed':
          return store.findById(event.id).andThen((current) => {
            const view = applyNamedListEvent(current, event);
            if (!view) {
              return errAsync(storageError('Rename did not project a list'));
            }
            return store.update(view).andThen(persistRecords);
          });
        case 'OpenTasksReordered':
          if (!persistOpenTaskOrders) {
            return errAsync(storageError('Cannot persist reorder without order adapter'));
          }
          return persistOpenTaskOrders(event.orders).andThen(persistRecords);
      }
    };

    return run().mapErr((error) => {
      restoreList();
      restoreLog();
      return error;
    });
  };
};
