import { errAsync } from 'neverthrow';
import type { TaskStore } from '../domain/task-store.js';
import { applyTaskEvent } from '../domain/apply-task-event.js';
import { storageError } from '../domain/task-errors.js';
import type { PersistTaskEvent } from '../application/ports.js';

export const createStoreBackedPersist = (store: TaskStore): PersistTaskEvent => {
  return ({ event, current }) => {
    switch (event.type) {
      case 'TaskCreated':
        return store.save(applyTaskEvent(null, event));
      case 'TaskUpdated':
        if (!current) {
          return errAsync(storageError(`Cannot persist ${event.type} without current state`));
        }
        return store.update(applyTaskEvent(current, event));
      case 'TaskCompleted':
        if (!current) {
          return errAsync(storageError(`Cannot persist ${event.type} without current state`));
        }
        return store.update(applyTaskEvent(current, event));
      case 'TaskUncompleted':
        if (!current) {
          return errAsync(storageError(`Cannot persist ${event.type} without current state`));
        }
        return store
          .update(applyTaskEvent(current, event))
          .andThen(() => store.setOpenOrders(event.siblingOrders));
    }
  };
};
