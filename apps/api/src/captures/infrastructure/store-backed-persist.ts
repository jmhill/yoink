import { errAsync } from 'neverthrow';
import type { CaptureStore } from '../domain/capture-store.js';
import { applyCaptureEvent } from '../domain/apply-capture-event.js';
import { storageError } from '../domain/capture-errors.js';
import type { PersistCaptureEvent } from '../application/ports.js';

export const createStoreBackedPersist = (store: CaptureStore): PersistCaptureEvent => {
  return ({ event, current }) => {
    switch (event.type) {
      case 'CaptureCreated':
        return store.save(applyCaptureEvent(null, event)).map(() => ({}));
      case 'CaptureDeleted':
        return store.softDelete(event.id).map(() => ({}));
      case 'CaptureTrashEmptied':
        return store.softDeleteTrashed(event.organizationId).map((deletedCount) => ({
          deletedCount,
        }));
      default:
        if (!current) {
          return errAsync(storageError(`Cannot persist ${event.type} without current state`));
        }
        return store.update(applyCaptureEvent(current, event)).map(() => ({}));
    }
  };
};
