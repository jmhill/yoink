import { describe, it, expect } from 'vitest';
import { createFakeTokenStore } from './fake-token-store.js';
import type { ApiToken } from '../domain/api-token.js';

const createTestToken = (overrides: Partial<ApiToken> = {}): ApiToken => ({
  id: 'token-123',
  userId: 'user-456',
  organizationId: 'org-789',
  tokenHash: 'hashed-secret',
  name: 'test-token',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createFakeTokenStore', () => {
  describe('save', () => {
    it('persists a token', async () => {
      const store = createFakeTokenStore();
      const token = createTestToken();

      const saveResult = await store.save(token);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(token.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(token);
      }
    });

    it('returns error when configured to fail', async () => {
      const store = createFakeTokenStore({ shouldFailOnSave: true });
      const token = createTestToken();

      const result = await store.save(token);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('TOKEN_STORAGE_ERROR');
      }
    });
  });

  describe('findById', () => {
    it('returns null when token not found', async () => {
      const store = createFakeTokenStore();

      const result = await store.findById('non-existent');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it('returns token from initial tokens', async () => {
      const token = createTestToken({ id: 'initial-token' });
      const store = createFakeTokenStore({ initialTokens: [token] });

      const result = await store.findById('initial-token');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(token);
      }
    });

    it('returns error when configured to fail', async () => {
      const store = createFakeTokenStore({ shouldFailOnFind: true });

      const result = await store.findById('any-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('TOKEN_STORAGE_ERROR');
      }
    });
  });

  describe('updateLastUsed', () => {
    it('updates lastUsedAt timestamp', async () => {
      const token = createTestToken();
      const store = createFakeTokenStore({ initialTokens: [token] });

      const updateResult = await store.updateLastUsed(token.id, '2024-06-15T12:00:00.000Z');

      expect(updateResult.isOk()).toBe(true);

      const findResult = await store.findById(token.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.lastUsedAt).toBe('2024-06-15T12:00:00.000Z');
      }
    });

    it('returns error when configured to fail', async () => {
      const store = createFakeTokenStore({ shouldFailOnSave: true });

      const result = await store.updateLastUsed('any-id', '2024-06-15T12:00:00.000Z');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('TOKEN_STORAGE_ERROR');
      }
    });
  });

  describe('hasAnyTokens', () => {
    it('returns false when no tokens exist', async () => {
      const store = createFakeTokenStore();

      const result = await store.hasAnyTokens();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });

    it('returns true when tokens exist', async () => {
      const store = createFakeTokenStore({ initialTokens: [createTestToken()] });

      const result = await store.hasAnyTokens();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it('returns error when configured to fail', async () => {
      const store = createFakeTokenStore({ shouldFailOnFind: true });

      const result = await store.hasAnyTokens();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('TOKEN_STORAGE_ERROR');
      }
    });
  });
});
