import type { TokenStore } from '../domain/token-store.js';
import type {
  PersistReissue,
  PersistTokenCreated,
  PersistTokenRevoked,
} from '../application/token-ports.js';

export const createStoreBackedTokenCreated = (store: TokenStore): PersistTokenCreated => {
  return ({ event, tokenHash }) =>
    store.save({
      id: event.id,
      userId: event.userId,
      organizationId: event.organizationId,
      tokenHash,
      name: event.name,
      createdAt: event.createdAt,
    });
};

export const createStoreBackedTokenRevoked = (store: TokenStore): PersistTokenRevoked => {
  return (event) => store.revoke(event.id, event.revokedAt);
};

export const createStoreBackedTokenReissue = (store: TokenStore): PersistReissue => {
  return ({ revoke, create }) =>
    store.reissue({
      userId: revoke.userId,
      organizationId: revoke.organizationId,
      revokedAt: revoke.revokedAt,
      token: {
        id: create.event.id,
        userId: create.event.userId,
        organizationId: create.event.organizationId,
        tokenHash: create.tokenHash,
        name: create.event.name,
        createdAt: create.event.createdAt,
      },
    });
};
