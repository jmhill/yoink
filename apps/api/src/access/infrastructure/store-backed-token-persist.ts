import { errAsync } from 'neverthrow';
import type { TokenStore } from '../domain/token-store.js';
import { applyTokenEvent } from '../domain/apply-token-event.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import { toTokenInfo } from '../domain/token-info.js';
import type { PersistTokenEvent } from '../application/token-ports.js';

export const createStoreBackedTokenPersist = (store: TokenStore): PersistTokenEvent => {
  return ({ event, tokenHash }) => {
    switch (event.type) {
      case 'TokenCreated': {
        if (!tokenHash) {
          return errAsync(tokenStorageError('Create persist requires a token hash'));
        }
        const view = applyTokenEvent(null, event);
        if (!view) {
          return errAsync(tokenStorageError('Create did not project a token'));
        }
        return store.save({
          id: event.id,
          userId: event.userId,
          organizationId: event.organizationId,
          tokenHash,
          name: event.name,
          createdAt: event.createdAt,
        });
      }
      case 'TokenRenamed':
        return store.findById(event.id).andThen((current) => {
          const view = applyTokenEvent(current ? toTokenInfo(current) : null, event);
          if (!view) {
            return errAsync(tokenStorageError('Rename did not project a token'));
          }
          return store.updateName(event.id, event.name);
        });
      case 'TokenRevoked':
        return store.delete(event.id);
    }
  };
};
