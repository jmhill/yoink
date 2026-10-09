import { errAsync } from 'neverthrow';
import type { TokenStore } from '../domain/token-store.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import type { PersistTokenEvent } from '../application/token-ports.js';

export const createStoreBackedTokenPersist = (store: TokenStore): PersistTokenEvent => {
  return ({ event, tokenHash }) => {
    switch (event.type) {
      case 'TokenCreated': {
        if (!tokenHash) {
          return errAsync(tokenStorageError('Create persist requires a token hash'));
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
        return store.updateName(event.id, event.name);
      case 'TokenRevoked':
        return store.revoke(event.id, event.revokedAt);
    }
  };
};
