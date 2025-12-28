import { describe, it, expect } from 'vitest';
import { createFakeUserStore } from './fake-user-store.js';
import type { User } from '../domain/user.js';

const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-123',
  organizationId: 'org-456',
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createFakeUserStore', () => {
  describe('save', () => {
    it('persists a user', async () => {
      const store = createFakeUserStore();
      const user = createTestUser();

      const saveResult = await store.save(user);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(user.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(user);
      }
    });

    it('returns error when configured to fail', async () => {
      const store = createFakeUserStore({ shouldFailOnSave: true });
      const user = createTestUser();

      const result = await store.save(user);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_STORAGE_ERROR');
      }
    });
  });

  describe('findById', () => {
    it('returns null when user not found', async () => {
      const store = createFakeUserStore();

      const result = await store.findById('non-existent');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it('returns user from initial users', async () => {
      const user = createTestUser({ id: 'initial-user' });
      const store = createFakeUserStore({ initialUsers: [user] });

      const result = await store.findById('initial-user');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(user);
      }
    });

    it('returns error when configured to fail', async () => {
      const store = createFakeUserStore({ shouldFailOnFind: true });

      const result = await store.findById('any-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_STORAGE_ERROR');
      }
    });
  });
});
