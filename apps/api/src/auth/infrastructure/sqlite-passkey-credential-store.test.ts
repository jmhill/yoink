import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createSqlitePasskeyCredentialStore } from './sqlite-passkey-credential-store.js';
import { createSqliteOrganizationStore } from '../../organizations/infrastructure/sqlite-organization-store.js';
import { createSqliteUserStore } from '../../users/infrastructure/sqlite-user-store.js';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import type { PasskeyCredential } from '../domain/passkey-credential.js';
import type { PasskeyCredentialStore } from '../domain/passkey-credential-store.js';

const createTestCredential = (
  overrides: Partial<PasskeyCredential> = {}
): PasskeyCredential => ({
  id: 'cred-base64url-encoded-id',
  userId: '550e8400-e29b-41d4-a716-446655440002',
  publicKey: 'public-key-base64url-encoded',
  counter: 0,
  transports: ['internal', 'hybrid'],
  deviceType: 'multiDevice',
  backedUp: true,
  name: 'MacBook Pro',
  createdAt: '2024-01-01T00:00:00.000Z',
  lastUsedAt: undefined,
  ...overrides,
});

describe('createSqlitePasskeyCredentialStore', () => {
  let db: Database;
  let store: PasskeyCredentialStore;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clear data between tests (in correct order for foreign keys)
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
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Test Org',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    await userStore.save({
      id: '550e8400-e29b-41d4-a716-446655440002',
      organizationId: '550e8400-e29b-41d4-a716-446655440001',
      email: 'user@test.com',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    store = await createSqlitePasskeyCredentialStore(db);
  });

  describe('save', () => {
    it('persists a passkey credential', async () => {
      const credential = createTestCredential();

      const saveResult = await store.save(credential);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(credential.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(credential);
      }
    });

    it('persists credential without optional fields', async () => {
      const credential = createTestCredential({
        transports: undefined,
        name: undefined,
        lastUsedAt: undefined,
      });

      const saveResult = await store.save(credential);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(credential.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.transports).toBeUndefined();
        expect(findResult.value?.name).toBeUndefined();
        expect(findResult.value?.lastUsedAt).toBeUndefined();
      }
    });

    it('persists singleDevice credential', async () => {
      const credential = createTestCredential({
        deviceType: 'singleDevice',
        backedUp: false,
        transports: ['usb'],
      });

      await store.save(credential);

      const findResult = await store.findById(credential.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.deviceType).toBe('singleDevice');
        expect(findResult.value?.backedUp).toBe(false);
        expect(findResult.value?.transports).toEqual(['usb']);
      }
    });
  });

  describe('findById', () => {
    it('returns credential when found', async () => {
      const credential = createTestCredential();
      await store.save(credential);

      const result = await store.findById(credential.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.id).toBe(credential.id);
        expect(result.value?.publicKey).toBe(credential.publicKey);
      }
    });

    it('returns null when credential not found', async () => {
      const result = await store.findById('non-existent-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('findByUserId', () => {
    it('returns empty array when no credentials exist', async () => {
      const result = await store.findByUserId('550e8400-e29b-41d4-a716-446655440002');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns all credentials for a user', async () => {
      const cred1 = createTestCredential({
        id: 'cred-1',
        name: 'MacBook Pro',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      const cred2 = createTestCredential({
        id: 'cred-2',
        name: 'iPhone 15',
        createdAt: '2024-01-02T00:00:00.000Z',
      });

      await store.save(cred1);
      await store.save(cred2);

      const result = await store.findByUserId('550e8400-e29b-41d4-a716-446655440002');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        // Should be ordered by createdAt DESC (newest first)
        expect(result.value[0].id).toBe('cred-2');
        expect(result.value[1].id).toBe('cred-1');
      }
    });

    it('does not return credentials from other users', async () => {
      // Create another user
      const userStore = await createSqliteUserStore(db);
      await userStore.save({
        id: '550e8400-e29b-41d4-a716-446655440003',
        organizationId: '550e8400-e29b-41d4-a716-446655440001',
        email: 'other@test.com',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const cred1 = createTestCredential({
        id: 'cred-1',
        userId: '550e8400-e29b-41d4-a716-446655440002',
      });
      const cred2 = createTestCredential({
        id: 'cred-2',
        userId: '550e8400-e29b-41d4-a716-446655440003',
      });

      await store.save(cred1);
      await store.save(cred2);

      const result = await store.findByUserId('550e8400-e29b-41d4-a716-446655440002');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].id).toBe('cred-1');
      }
    });
  });

  describe('updateCounter', () => {
    it('updates the signature counter', async () => {
      const credential = createTestCredential({ counter: 0 });
      await store.save(credential);

      const updateResult = await store.updateCounter(credential.id, 5);

      expect(updateResult.isOk()).toBe(true);

      const findResult = await store.findById(credential.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.counter).toBe(5);
      }
    });

    it('succeeds even when credential does not exist', async () => {
      const result = await store.updateCounter('non-existent', 10);

      // SQLite UPDATE doesn't fail on non-existent rows
      expect(result.isOk()).toBe(true);
    });
  });

  describe('updateLastUsed', () => {
    it('updates the lastUsedAt timestamp', async () => {
      const credential = createTestCredential({ lastUsedAt: undefined });
      await store.save(credential);

      const newTimestamp = '2024-06-15T12:00:00.000Z';
      const updateResult = await store.updateLastUsed(credential.id, newTimestamp);

      expect(updateResult.isOk()).toBe(true);

      const findResult = await store.findById(credential.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.lastUsedAt).toBe(newTimestamp);
      }
    });
  });

  describe('delete', () => {
    it('removes a credential', async () => {
      const credential = createTestCredential();
      await store.save(credential);

      const deleteResult = await store.delete(credential.id);

      expect(deleteResult.isOk()).toBe(true);

      const findResult = await store.findById(credential.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toBeNull();
      }
    });

    it('succeeds even when credential does not exist', async () => {
      const result = await store.delete('non-existent-id');

      expect(result.isOk()).toBe(true);
    });
  });
});
