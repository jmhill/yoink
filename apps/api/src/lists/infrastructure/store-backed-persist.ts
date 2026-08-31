import type { ListStore } from '../domain/list-store.js';
import { applyNamedListEvent } from '../domain/apply-named-list-event.js';
import type { PersistNamedListEvent } from '../application/ports.js';

export const createStoreBackedPersist = (store: ListStore): PersistNamedListEvent => {
  return ({ event }) => {
    switch (event.type) {
      case 'NamedListCreated':
        return store.save(applyNamedListEvent(null, event));
    }
  };
};
