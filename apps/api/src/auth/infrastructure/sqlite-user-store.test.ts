import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteUserStore } from './sqlite-user-store.js';
import { createSqliteOrganizationStore } from './sqlite-organization-store.js';
import { runMigrations } from '../../database/migrator.js';
import { migrations } from '../../database/migrations.js';
import type { User } from '../domain/user.js';
import type { UserStore } from '../domain/user-store.js';

const TEST_ORG = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Organization',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: '550e8400-e29b-41d4-a716-446655440002',
  organizationId: TEST_ORG.id,
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createSqliteUserStore', () => {
  let db: DatabaseSync;
  let store: UserStore;

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

    // Create required parent organization
    const orgStore = createSqliteOrganizationStore(db);
    await orgStore.save(TEST_ORG);

    store = createSqliteUserStore(db);
  });

  describe('save', () => {
    it('persists a user', async () => {
      const user = createTestUser();

      const saveResult = await store.save(user);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(user.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(user);
      }
    });
  });

  describe('findById', () => {
    it('returns user when found', async () => {
      const user = createTestUser({ email: 'alice@example.com' });
      await store.save(user);

      const result = await store.findById(user.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.email).toBe('alice@example.com');
      }
    });

    it('returns null when user not found', async () => {
      const result = await store.findById('non-existent-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });
});
