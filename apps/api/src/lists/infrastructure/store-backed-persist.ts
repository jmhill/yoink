import { errAsync } from 'neverthrow';
import type { ListStore } from '../domain/list-store.js';
import { applyNamedListEvent } from '../domain/apply-named-list-event.js';
import { storageError } from '../domain/list-errors.js';
import type { PersistNamedListEvent } from '../application/ports.js';

export const createStoreBackedPersist = (store: ListStore): PersistNamedListEvent => {
  return ({ event }) => {
    switch (event.type) {
      case 'NamedListCreated': {
        const view = applyNamedListEvent(null, event);
        if (!view) {
          return errAsync(storageError('Create did not project a list'));
        }
        return store.save(view);
      }
      case 'NamedListDeleted':
        return store.remove(event.id);
    }
  };
};
