import { describe, it, expect, beforeEach } from 'vitest';
import { createSqliteTokenStore } from './sqlite-token-store.js';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenStore } from '../domain/token-store.js';

const createTestToken = (overrides: Partial<ApiToken> = {}): ApiToken => ({
  id: '550e8400-e29b-41d4-a716-446655440003',
  userId: '550e8400-e29b-41d4-a716-446655440002',
  tokenHash: 'bcrypt-hash-here',
  name: 'default-token',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createSqliteTokenStore', () => {
  let store: TokenStore;

  beforeEach(() => {
    store = createSqliteTokenStore({ location: ':memory:' });
  });

  describe('save', () => {
    it('persists a token', async () => {
      const token = createTestToken();

      await store.save(token);

      const found = await store.findById(token.id);
      expect(found).toEqual(token);
    });

    it('persists token with lastUsedAt', async () => {
      const token = createTestToken({
        lastUsedAt: '2024-06-15T12:00:00.000Z',
      });

      await store.save(token);

      const found = await store.findById(token.id);
      expect(found?.lastUsedAt).toBe('2024-06-15T12:00:00.000Z');
    });
  });

  describe('findById', () => {
    it('returns token when found', async () => {
      const token = createTestToken({ name: 'My Token' });
      await store.save(token);

      const found = await store.findById(token.id);

      expect(found).not.toBeNull();
      expect(found?.name).toBe('My Token');
    });

    it('returns null when token not found', async () => {
      const found = await store.findById('non-existent-id');

      expect(found).toBeNull();
    });
  });

  describe('updateLastUsed', () => {
    it('updates lastUsedAt timestamp', async () => {
      const token = createTestToken();
      await store.save(token);

      await store.updateLastUsed(token.id, '2024-06-20T15:30:00.000Z');

      const found = await store.findById(token.id);
      expect(found?.lastUsedAt).toBe('2024-06-20T15:30:00.000Z');
    });
  });

  describe('hasAnyTokens', () => {
    it('returns false when no tokens exist', async () => {
      const result = await store.hasAnyTokens();

      expect(result).toBe(false);
    });

    it('returns true when tokens exist', async () => {
      await store.save(createTestToken());

      const result = await store.hasAnyTokens();

      expect(result).toBe(true);
    });
  });
});
