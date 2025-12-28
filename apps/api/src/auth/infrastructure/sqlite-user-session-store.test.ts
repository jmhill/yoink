import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createSqliteUserSessionStore } from './sqlite-user-session-store.js';
import { createSqliteOrganizationStore } from '../../organizations/infrastructure/sqlite-organization-store.js';
import { createSqliteUserStore } from '../../users/infrastructure/sqlite-user-store.js';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import type { UserSession } from '../domain/user-session.js';
import type { UserSessionStore } from '../domain/user-session-store.js';

const ORG_ID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID = '550e8400-e29b-41d4-a716-446655440002';

const createTestSession = (
  overrides: Partial<UserSession> = {}
): UserSession => ({
  id: '550e8400-e29b-41d4-a716-446655440010',
  userId: USER_ID,
  currentOrganizationId: ORG_ID,
  createdAt: '2024-01-01T00:00:00.000Z',
  expiresAt: '2024-01-08T00:00:00.000Z', // 7 days later
  lastActiveAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createSqliteUserSessionStore', () => {
  let db: Database;
  let store: UserSessionStore;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clear data between tests (in correct order for foreign keys)
    await db.execute({ sql: 'DELETE FROM user_sessions' });
    await db.execute({ sql: 'DELETE FROM passkey_credentials' });
    await db.execute({ sql: 'DELETE FROM organization_memberships' });
    await db.execute({ sql: 'DELETE FROM api_tokens' });
    await db.execute({ sql: 'DELETE FROM captures' });
    await db.execute({ sql: 'DELETE FROM tasks' });
    await db.execute({ sql: 'DELETE FROM users' });
    await db.execute({ sql: 'DELETE FROM organizations' });

    // Set up test org and user for foreign key constraints
    const orgStore = await createSqliteOrganizationStore(db);
    const userStore = await createSqliteUserStore(db);

    await orgStore.save({
      id: ORG_ID,
      name: 'Test Org',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    await userStore.save({
      id: USER_ID,
      organizationId: ORG_ID,
      email: 'user@test.com',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    store = await createSqliteUserSessionStore(db);
  });

  describe('save', () => {
    it('persists a user session', async () => {
      const session = createTestSession();

      const saveResult = await store.save(session);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(session.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(session);
      }
    });
  });

  describe('findById', () => {
    it('returns session when found', async () => {
      const session = createTestSession();
      await store.save(session);

      const result = await store.findById(session.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.id).toBe(session.id);
        expect(result.value?.userId).toBe(session.userId);
        expect(result.value?.currentOrganizationId).toBe(session.currentOrganizationId);
      }
    });

    it('returns null when session not found', async () => {
      const result = await store.findById('550e8400-e29b-41d4-a716-446655440099');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('findByUserId', () => {
    it('returns empty array when no sessions exist', async () => {
      const result = await store.findByUserId(USER_ID);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns all sessions for a user', async () => {
      const session1 = createTestSession({
        id: '550e8400-e29b-41d4-a716-446655440010',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      const session2 = createTestSession({
        id: '550e8400-e29b-41d4-a716-446655440011',
        createdAt: '2024-01-02T00:00:00.000Z',
      });

      await store.save(session1);
      await store.save(session2);

      const result = await store.findByUserId(USER_ID);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        // Should be ordered by createdAt DESC (newest first)
        expect(result.value[0].id).toBe('550e8400-e29b-41d4-a716-446655440011');
        expect(result.value[1].id).toBe('550e8400-e29b-41d4-a716-446655440010');
      }
    });

    it('does not return sessions from other users', async () => {
      // Create another user
      const userStore = await createSqliteUserStore(db);
      const otherUserId = '550e8400-e29b-41d4-a716-446655440003';
      await userStore.save({
        id: otherUserId,
        organizationId: ORG_ID,
        email: 'other@test.com',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const session1 = createTestSession({
        id: '550e8400-e29b-41d4-a716-446655440010',
        userId: USER_ID,
      });
      const session2 = createTestSession({
        id: '550e8400-e29b-41d4-a716-446655440011',
        userId: otherUserId,
      });

      await store.save(session1);
      await store.save(session2);

      const result = await store.findByUserId(USER_ID);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].id).toBe('550e8400-e29b-41d4-a716-446655440010');
      }
    });
  });

  describe('updateLastActive', () => {
    it('updates the lastActiveAt timestamp', async () => {
      const session = createTestSession();
      await store.save(session);

      const newTimestamp = '2024-01-05T12:00:00.000Z';
      const updateResult = await store.updateLastActive(session.id, newTimestamp);

      expect(updateResult.isOk()).toBe(true);

      const findResult = await store.findById(session.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.lastActiveAt).toBe(newTimestamp);
      }
    });

    it('succeeds even when session does not exist', async () => {
      const result = await store.updateLastActive('non-existent', '2024-01-05T12:00:00.000Z');

      // SQLite UPDATE doesn't fail on non-existent rows
      expect(result.isOk()).toBe(true);
    });
  });

  describe('updateCurrentOrganization', () => {
    it('updates the currentOrganizationId', async () => {
      // Create a second org
      const orgStore = await createSqliteOrganizationStore(db);
      const newOrgId = '550e8400-e29b-41d4-a716-446655440005';
      await orgStore.save({
        id: newOrgId,
        name: 'Second Org',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const session = createTestSession();
      await store.save(session);

      const updateResult = await store.updateCurrentOrganization(session.id, newOrgId);

      expect(updateResult.isOk()).toBe(true);

      const findResult = await store.findById(session.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.currentOrganizationId).toBe(newOrgId);
      }
    });
  });

  describe('delete', () => {
    it('removes a session', async () => {
      const session = createTestSession();
      await store.save(session);

      const deleteResult = await store.delete(session.id);

      expect(deleteResult.isOk()).toBe(true);

      const findResult = await store.findById(session.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toBeNull();
      }
    });

    it('succeeds even when session does not exist', async () => {
      const result = await store.delete('non-existent-id');

      expect(result.isOk()).toBe(true);
    });
  });

  describe('deleteByUserId', () => {
    it('removes all sessions for a user', async () => {
      const session1 = createTestSession({
        id: '550e8400-e29b-41d4-a716-446655440010',
      });
      const session2 = createTestSession({
        id: '550e8400-e29b-41d4-a716-446655440011',
      });

      await store.save(session1);
      await store.save(session2);

      const deleteResult = await store.deleteByUserId(USER_ID);

      expect(deleteResult.isOk()).toBe(true);

      const findResult = await store.findByUserId(USER_ID);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toHaveLength(0);
      }
    });

    it('does not delete sessions from other users', async () => {
      // Create another user
      const userStore = await createSqliteUserStore(db);
      const otherUserId = '550e8400-e29b-41d4-a716-446655440003';
      await userStore.save({
        id: otherUserId,
        organizationId: ORG_ID,
        email: 'other@test.com',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const session1 = createTestSession({
        id: '550e8400-e29b-41d4-a716-446655440010',
        userId: USER_ID,
      });
      const session2 = createTestSession({
        id: '550e8400-e29b-41d4-a716-446655440011',
        userId: otherUserId,
      });

      await store.save(session1);
      await store.save(session2);

      await store.deleteByUserId(USER_ID);

      // Other user's session should still exist
      const findResult = await store.findByUserId(otherUserId);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toHaveLength(1);
        expect(findResult.value[0].id).toBe('550e8400-e29b-41d4-a716-446655440011');
      }
    });
  });

  describe('deleteExpired', () => {
    it('removes expired sessions and returns count', async () => {
      // Create one expired session and one valid session
      const expiredSession = createTestSession({
        id: '550e8400-e29b-41d4-a716-446655440010',
        expiresAt: '2024-01-01T00:00:00.000Z', // Expired
      });
      const validSession = createTestSession({
        id: '550e8400-e29b-41d4-a716-446655440011',
        expiresAt: '2024-12-31T00:00:00.000Z', // Valid
      });

      await store.save(expiredSession);
      await store.save(validSession);

      // Delete sessions expired before this timestamp
      const now = '2024-06-15T00:00:00.000Z';
      const deleteResult = await store.deleteExpired(now);

      expect(deleteResult.isOk()).toBe(true);
      if (deleteResult.isOk()) {
        expect(deleteResult.value).toBe(1); // One session deleted
      }

      // Expired session should be gone
      const expiredFind = await store.findById(expiredSession.id);
      expect(expiredFind.isOk() && expiredFind.value).toBeNull();

      // Valid session should still exist
      const validFind = await store.findById(validSession.id);
      expect(validFind.isOk() && validFind.value).not.toBeNull();
    });

    it('returns 0 when no sessions are expired', async () => {
      const validSession = createTestSession({
        expiresAt: '2024-12-31T00:00:00.000Z',
      });

      await store.save(validSession);

      const now = '2024-01-15T00:00:00.000Z';
      const deleteResult = await store.deleteExpired(now);

      expect(deleteResult.isOk()).toBe(true);
      if (deleteResult.isOk()) {
        expect(deleteResult.value).toBe(0);
      }
    });
  });
});
