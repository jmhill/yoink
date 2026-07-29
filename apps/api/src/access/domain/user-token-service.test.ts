import { describe, it, expect, beforeEach } from 'vitest';
import { createFakeTokenStore } from '../infrastructure/fake-token-store.js';
import { createUserTokenService, type UserTokenService } from './user-token-service.js';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { TokenStore } from './token-store.js';
import type { ApiToken } from './api-token.js';

describe('UserTokenService', () => {
  const fixedTime = new Date('2024-01-15T10:00:00.000Z');
  const clock = createFakeClock(fixedTime);
  const idGenerator = createFakeIdGenerator();

  // Mock password hasher - just returns a predictable hash
  const passwordHasher = {
    hash: async (password: string) => `hashed:${password}`,
    compare: async (password: string, hash: string) => hash === `hashed:${password}`,
  };

  let tokenStore: TokenStore;
  let service: UserTokenService;

  const userId = 'user-123';
  const organizationId = 'org-456';

  beforeEach(() => {
    tokenStore = createFakeTokenStore();
    service = createUserTokenService({
      tokenStore,
      clock,
      idGenerator,
      passwordHasher,
      maxTokensPerUserPerOrg: 2,
    });
  });

  describe('listTokens', () => {
    it('returns empty array when user has no tokens', async () => {
      const result = await service.listTokens(userId, organizationId);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
    });

    it('returns tokens for the specified user and organization', async () => {
      // Create tokens directly in the store
      const token: ApiToken = {
        id: 'token-1',
        userId,
        organizationId,
        tokenHash: 'hash',
        name: 'My Token',
        createdAt: '2024-01-10T00:00:00.000Z',
      };
      await tokenStore.save(token);

      const result = await service.listTokens(userId, organizationId);

      expect(result.isOk()).toBe(true);
      const tokens = result._unsafeUnwrap();
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toEqual({
        id: 'token-1',
        name: 'My Token',
        createdAt: '2024-01-10T00:00:00.000Z',
        lastUsedAt: undefined,
      });
    });

    it('does not return tokens from other organizations', async () => {
      // Token in a different org
      const token: ApiToken = {
        id: 'token-1',
        userId,
        organizationId: 'other-org',
        tokenHash: 'hash',
        name: 'Other Org Token',
        createdAt: '2024-01-10T00:00:00.000Z',
      };
      await tokenStore.save(token);

      const result = await service.listTokens(userId, organizationId);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
    });

    it('does not return tokens from other users', async () => {
      // Token for a different user
      const token: ApiToken = {
        id: 'token-1',
        userId: 'other-user',
        organizationId,
        tokenHash: 'hash',
        name: 'Other User Token',
        createdAt: '2024-01-10T00:00:00.000Z',
      };
      await tokenStore.save(token);

      const result = await service.listTokens(userId, organizationId);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual([]);
    });
  });

  describe('createToken', () => {
    it('creates a new token and returns the raw token value', async () => {
      const result = await service.createToken({
        userId,
        organizationId,
        name: 'Extension Token',
      });

      expect(result.isOk()).toBe(true);
      const { token, rawToken } = result._unsafeUnwrap();

      expect(token.name).toBe('Extension Token');
      expect(token.createdAt).toBe(fixedTime.toISOString());
      expect(rawToken).toMatch(/^[^:]+:[^:]+$/); // tokenId:secret format
    });

    it('prevents creating more than the token limit', async () => {
      // Create 2 tokens (the limit)
      await service.createToken({ userId, organizationId, name: 'Token 1' });
      await service.createToken({ userId, organizationId, name: 'Token 2' });

      // Try to create a third
      const result = await service.createToken({
        userId,
        organizationId,
        name: 'Token 3',
      });

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe('TOKEN_LIMIT_REACHED');
      if (error.type === 'TOKEN_LIMIT_REACHED') {
        expect(error.userId).toBe(userId);
        expect(error.organizationId).toBe(organizationId);
        expect(error.limit).toBe(2);
      }
    });

    it('allows creating tokens up to the limit in different organizations', async () => {
      // Create 2 tokens in org1
      await service.createToken({ userId, organizationId: 'org-1', name: 'Token 1' });
      await service.createToken({ userId, organizationId: 'org-1', name: 'Token 2' });

      // Should still be able to create in org2
      const result = await service.createToken({
        userId,
        organizationId: 'org-2',
        name: 'Token 3',
      });

      expect(result.isOk()).toBe(true);
    });
  });

  describe('revokeToken', () => {
    it('deletes a token owned by the user', async () => {
      // Create a token
      const createResult = await service.createToken({
        userId,
        organizationId,
        name: 'Token to delete',
      });
      const { token } = createResult._unsafeUnwrap();

      // Revoke it
      const result = await service.revokeToken(userId, token.id);

      expect(result.isOk()).toBe(true);

      // Verify it's gone
      const listResult = await service.listTokens(userId, organizationId);
      expect(listResult._unsafeUnwrap()).toEqual([]);
    });

    it('returns error when token does not exist', async () => {
      const result = await service.revokeToken(userId, 'non-existent-token');

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe('USER_TOKEN_NOT_FOUND');
    });

    it('returns error when user does not own the token', async () => {
      // Create a token for another user
      const token: ApiToken = {
        id: 'other-token',
        userId: 'other-user',
        organizationId,
        tokenHash: 'hash',
        name: 'Other Token',
        createdAt: '2024-01-10T00:00:00.000Z',
      };
      await tokenStore.save(token);

      // Try to revoke it as our user
      const result = await service.revokeToken(userId, 'other-token');

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe('TOKEN_OWNERSHIP_ERROR');
      if (error.type === 'TOKEN_OWNERSHIP_ERROR') {
        expect(error.tokenId).toBe('other-token');
        expect(error.userId).toBe(userId);
      }
    });
  });
});
