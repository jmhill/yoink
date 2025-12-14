import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteTokenStore } from './sqlite-token-store.js';
import { createSqliteOrganizationStore } from './sqlite-organization-store.js';
import { createSqliteUserStore } from './sqlite-user-store.js';
import { runMigrations } from '../../database/migrator.js';
import { migrations } from '../../database/migrations.js';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenStore } from '../domain/token-store.js';

const TEST_ORG = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Organization',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const TEST_USER = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  organizationId: TEST_ORG.id,
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const createTestToken = (overrides: Partial<ApiToken> = {}): ApiToken => ({
  id: '550e8400-e29b-41d4-a716-446655440003',
  userId: TEST_USER.id,
  tokenHash: 'bcrypt-hash-here',
  name: 'default-token',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createSqliteTokenStore', () => {
  let db: DatabaseSync;
  let store: TokenStore;

  beforeAll(() => {
    db = new DatabaseSync(':memory:');
    runMigrations(db, migrations);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(async () => {
    // Clear data between tests (respecting foreign key order)
    db.exec('DELETE FROM api_tokens');
    db.exec('DELETE FROM captures');
    db.exec('DELETE FROM users');
    db.exec('DELETE FROM organizations');

    // Create required parent records
    const orgStore = createSqliteOrganizationStore(db);
    await orgStore.save(TEST_ORG);

    const userStore = createSqliteUserStore(db);
    await userStore.save(TEST_USER);

    store = createSqliteTokenStore(db);
  });

  describe('save', () => {
    it('persists a token', async () => {
      const token = createTestToken();

      const saveResult = await store.save(token);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(token.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(token);
      }
    });

    it('persists token with lastUsedAt', async () => {
      const token = createTestToken({
        lastUsedAt: '2024-06-15T12:00:00.000Z',
      });

      const saveResult = await store.save(token);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(token.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.lastUsedAt).toBe('2024-06-15T12:00:00.000Z');
      }
    });
  });

  describe('findById', () => {
    it('returns token when found', async () => {
      const token = createTestToken({ name: 'My Token' });
      await store.save(token);

      const result = await store.findById(token.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.name).toBe('My Token');
      }
    });

    it('returns null when token not found', async () => {
      const result = await store.findById('non-existent-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('updateLastUsed', () => {
    it('updates lastUsedAt timestamp', async () => {
      const token = createTestToken();
      await store.save(token);

      const updateResult = await store.updateLastUsed(token.id, '2024-06-20T15:30:00.000Z');

      expect(updateResult.isOk()).toBe(true);

      const findResult = await store.findById(token.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.lastUsedAt).toBe('2024-06-20T15:30:00.000Z');
      }
    });
  });

  describe('hasAnyTokens', () => {
    it('returns false when no tokens exist', async () => {
      const result = await store.hasAnyTokens();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });

    it('returns true when tokens exist', async () => {
      await store.save(createTestToken());

      const result = await store.hasAnyTokens();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });
  });
});
