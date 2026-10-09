import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { Database } from '../../database/types.js';
import { insertChangeLogQuery } from '../../shared/change-log/infrastructure/sql.js';
import type { FakeChangeLogStore } from '../../shared/change-log/infrastructure/fake-change-log-store.js';
import { applyTaskEvent } from '../domain/apply-task-event.js';
import { changeLogRecordsFromTaskEvent } from '../domain/change-log-records.js';
import { storageError } from '../domain/task-errors.js';
import type { PersistTaskEvent } from '../application/ports.js';
import type { TaskStore } from '../domain/task-store.js';
import type { StorageError } from '../domain/task-errors.js';
import {
  insertTaskQuery,
  setOpenOrderQueries,
  softDeleteCaptureQuery,
  softDeleteTaskQuery,
  updateTaskQuery,
} from './task-row-statements.js';

export type PersistTaskEventInput = Parameters<PersistTaskEvent>[0];

const queriesForEvent = (
  input: PersistTaskEventInput,
  nextId: () => string
) => {
  const { event, current, actor, now } = input;
  const records = changeLogRecordsFromTaskEvent({
    event,
    current,
    actor,
    now,
    nextId,
  });
  const history = records.map(insertChangeLogQuery);

  switch (event.type) {
    case 'TaskCreated': {
      const view = applyTaskEvent(null, event, {
        now,
        actorUserId: actor?.userId ?? null,
      });
      return [insertTaskQuery(view), ...history];
    }
    case 'TaskUpdated':
    case 'TaskCompleted':
    case 'TaskPinned':
    case 'TaskUnpinned': {
      if (!current) {
        return null;
      }
      const view = applyTaskEvent(current, event, {
        now,
        actorUserId: actor?.userId ?? null,
      });
      return [updateTaskQuery(view), ...history];
    }
    case 'TaskUncompleted': {
      if (!current) {
        return null;
      }
      const view = applyTaskEvent(current, event, {
        now,
        actorUserId: actor?.userId ?? null,
      });
      return [
        updateTaskQuery(view),
        ...setOpenOrderQueries(event.siblingOrders),
        ...history,
      ];
    }
    case 'TaskDeleted': {
      const queries = [
        softDeleteTaskQuery(event.id, event.deletedAt),
        ...history,
      ];
      if (event.captureId) {
        queries.splice(1, 0, softDeleteCaptureQuery(event.captureId, event.deletedAt));
      }
      return queries;
    }
  }
};

export const createSqliteTaskPersist = (deps: {
  db: Database;
  nextId: () => string;
}): PersistTaskEvent => {
  return (input) => {
    const queries = queriesForEvent(input, deps.nextId);
    if (!queries) {
      return errAsync(storageError(`Cannot persist ${input.event.type} without current state`));
    }
    return ResultAsync.fromPromise(
      deps.db.batch(queries, 'write'),
      (error) => storageError('Failed to persist task change', error)
    );
  };
};

export type FakeTaskPersistDeps = {
  store: TaskStore & { captureSnapshot?: () => () => void };
  changeLog: FakeChangeLogStore;
  nextId: () => string;
  cascadeCapture?: (id: string) => ResultAsync<void, StorageError>;
};

/**
 * In-memory persist: apply the row mutations and history in one snapshot
 * so a failing change-log insert leaves the task row unchanged.
 */
export const createStoreBackedPersist = (deps: FakeTaskPersistDeps): PersistTaskEvent => {
  const { store, changeLog, nextId, cascadeCapture } = deps;

  return (input) => {
    const { event, current, actor, now } = input;
    const restoreTask = store.captureSnapshot?.() ?? (() => undefined);
    const restoreLog = changeLog.captureSnapshot();

    const rollback = () => {
      restoreTask();
      restoreLog();
    };

    const persistRecords = (): ResultAsync<void, StorageError> => {
      const records = changeLogRecordsFromTaskEvent({
        event,
        current,
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

    const run = (): ReturnType<PersistTaskEvent> => {
      switch (event.type) {
        case 'TaskCreated':
          return store
            .save(
              applyTaskEvent(null, event, { now, actorUserId: actor?.userId ?? null })
            )
            .andThen(persistRecords);
        case 'TaskUpdated':
        case 'TaskCompleted':
        case 'TaskPinned':
        case 'TaskUnpinned':
          if (!current) {
            return errAsync(storageError(`Cannot persist ${event.type} without current state`));
          }
          return store
            .update(
              applyTaskEvent(current, event, { now, actorUserId: actor?.userId ?? null })
            )
            .andThen(persistRecords);
        case 'TaskUncompleted':
          if (!current) {
            return errAsync(storageError(`Cannot persist ${event.type} without current state`));
          }
          return store
            .update(
              applyTaskEvent(current, event, { now, actorUserId: actor?.userId ?? null })
            )
            .andThen(() => store.setOpenOrders(event.siblingOrders))
            .andThen(persistRecords);
        case 'TaskDeleted': {
          const cascade =
            event.captureId && cascadeCapture
              ? cascadeCapture(event.captureId)
              : okAsync(undefined);
          return store.softDelete(event.id).andThen(() => cascade).andThen(persistRecords);
        }
      }
    };

    return run().mapErr((error) => {
      rollback();
      return error;
    });
  };
};
