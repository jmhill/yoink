import { errAsync } from 'neverthrow';
import type { TokenStore } from '../domain/token-store.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import type { PersistTokenEvent } from '../application/token-ports.js';
import type { PersistReissue } from '../application/handle-reissue-agent-token.js';

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
      case 'TokenRevoked':
        return store.revoke(event.id, event.revokedAt);
    }
  };
};

export const createStoreBackedTokenReissue = (store: TokenStore): PersistReissue => {
  return ({ revoke, create, tokenHash }) =>
    store.reissue({
      userId: create.userId,
      organizationId: create.organizationId,
      revokedAt: revoke[0]?.revokedAt ?? create.createdAt,
      token: {
        id: create.id,
        userId: create.userId,
        organizationId: create.organizationId,
        tokenHash,
        name: create.name,
        createdAt: create.createdAt,
      },
    });
};
