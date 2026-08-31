import type { TaskStore } from '../domain/task-store.js';
import { applyTaskEvent } from '../domain/apply-task-event.js';
import type { PersistTaskEvent } from '../application/ports.js';

export const createStoreBackedPersist = (store: TaskStore): PersistTaskEvent => {
  return ({ event, current }) => {
    switch (event.type) {
      case 'TaskUpdated':
        return store.update(applyTaskEvent(current, event));
    }
  };
};
