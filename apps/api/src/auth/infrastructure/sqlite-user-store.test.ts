import { describe, it, expect, beforeEach } from 'vitest';
import { createSqliteUserStore } from './sqlite-user-store.js';
import type { User } from '../domain/user.js';
import type { UserStore } from '../domain/user-store.js';

const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: '550e8400-e29b-41d4-a716-446655440002',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createSqliteUserStore', () => {
  let store: UserStore;

  beforeEach(() => {
    store = createSqliteUserStore({ location: ':memory:' });
  });

  describe('save', () => {
    it('persists a user', async () => {
      const user = createTestUser();

      await store.save(user);

      const found = await store.findById(user.id);
      expect(found).toEqual(user);
    });
  });

  describe('findById', () => {
    it('returns user when found', async () => {
      const user = createTestUser({ email: 'alice@example.com' });
      await store.save(user);

      const found = await store.findById(user.id);

      expect(found).not.toBeNull();
      expect(found?.email).toBe('alice@example.com');
    });

    it('returns null when user not found', async () => {
      const found = await store.findById('non-existent-id');

      expect(found).toBeNull();
    });
  });
});
