import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteOrganizationMembershipStore } from './sqlite-organization-membership-store.js';
import { createSqliteOrganizationStore } from './sqlite-organization-store.js';
import { createSqliteUserStore } from './sqlite-user-store.js';
import { runMigrations } from '../../database/migrator.js';
import { migrations } from '../../database/migrations.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';

const createTestMembership = (
  overrides: Partial<OrganizationMembership> = {}
): OrganizationMembership => ({
  id: '550e8400-e29b-41d4-a716-446655440010',
  userId: '550e8400-e29b-41d4-a716-446655440002',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  role: 'member',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createSqliteOrganizationMembershipStore', () => {
  let db: DatabaseSync;
  let store: OrganizationMembershipStore;

  beforeAll(() => {
    db = new DatabaseSync(':memory:');
    runMigrations(db, migrations);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    // Clear data between tests (in correct order for foreign keys)
    db.exec('DELETE FROM organization_memberships');
    db.exec('DELETE FROM api_tokens');
    db.exec('DELETE FROM captures');
    db.exec('DELETE FROM tasks');
    db.exec('DELETE FROM users');
    db.exec('DELETE FROM organizations');

    // Set up test org and user for foreign key constraints
    const orgStore = createSqliteOrganizationStore(db);
    const userStore = createSqliteUserStore(db);

    orgStore.save({
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Test Org',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    userStore.save({
      id: '550e8400-e29b-41d4-a716-446655440002',
      organizationId: '550e8400-e29b-41d4-a716-446655440001',
      email: 'user@test.com',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    store = createSqliteOrganizationMembershipStore(db);
  });

  describe('save', () => {
    it('persists a membership', async () => {
      const membership = createTestMembership();

      const saveResult = await store.save(membership);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findByUserAndOrg(membership.userId, membership.organizationId);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(membership);
      }
    });

    it('updates an existing membership role', async () => {
      const membership = createTestMembership({ role: 'member' });
      await store.save(membership);

      const updated = { ...membership, role: 'admin' as const };
      const updateResult = await store.save(updated);

      expect(updateResult.isOk()).toBe(true);

      const findResult = await store.findByUserAndOrg(membership.userId, membership.organizationId);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.role).toBe('admin');
      }
    });

    it('persists isPersonalOrg flag correctly', async () => {
      const membership = createTestMembership({ isPersonalOrg: true, role: 'owner' });

      await store.save(membership);

      const findResult = await store.findByUserAndOrg(membership.userId, membership.organizationId);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.isPersonalOrg).toBe(true);
        expect(findResult.value?.role).toBe('owner');
      }
    });
  });

  describe('findById', () => {
    it('returns membership when found', async () => {
      const membership = createTestMembership();
      await store.save(membership);

      const result = await store.findById(membership.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.id).toBe(membership.id);
        expect(result.value?.role).toBe('member');
      }
    });

    it('returns null when membership not found', async () => {
      const result = await store.findById('non-existent-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('findByUserAndOrg', () => {
    it('returns membership when found', async () => {
      const membership = createTestMembership();
      await store.save(membership);

      const result = await store.findByUserAndOrg(membership.userId, membership.organizationId);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.role).toBe('member');
      }
    });

    it('returns null when membership not found', async () => {
      const result = await store.findByUserAndOrg('non-existent', 'non-existent');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('findByUserId', () => {
    it('returns empty array when no memberships exist', async () => {
      const result = await store.findByUserId('550e8400-e29b-41d4-a716-446655440002');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns all memberships for a user', async () => {
      // Create a second org
      const orgStore = createSqliteOrganizationStore(db);
      await orgStore.save({
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: 'Second Org',
        createdAt: '2024-01-02T00:00:00.000Z',
      });

      const membership1 = createTestMembership({
        id: '550e8400-e29b-41d4-a716-446655440010',
        organizationId: '550e8400-e29b-41d4-a716-446655440001',
        joinedAt: '2024-01-01T00:00:00.000Z',
      });
      const membership2 = createTestMembership({
        id: '550e8400-e29b-41d4-a716-446655440011',
        organizationId: '550e8400-e29b-41d4-a716-446655440003',
        joinedAt: '2024-01-02T00:00:00.000Z',
      });

      await store.save(membership1);
      await store.save(membership2);

      const result = await store.findByUserId('550e8400-e29b-41d4-a716-446655440002');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        // Should be ordered by joinedAt ASC
        expect(result.value[0].organizationId).toBe('550e8400-e29b-41d4-a716-446655440001');
        expect(result.value[1].organizationId).toBe('550e8400-e29b-41d4-a716-446655440003');
      }
    });
  });

  describe('findByOrganizationId', () => {
    it('returns empty array when no members exist', async () => {
      const result = await store.findByOrganizationId('550e8400-e29b-41d4-a716-446655440001');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('delete', () => {
    it('removes a membership', async () => {
      const membership = createTestMembership();
      await store.save(membership);

      const deleteResult = await store.delete(membership.id);

      expect(deleteResult.isOk()).toBe(true);

      const findResult = await store.findByUserAndOrg(membership.userId, membership.organizationId);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toBeNull();
      }
    });

    it('succeeds even when membership does not exist', async () => {
      const result = await store.delete('non-existent-id');

      expect(result.isOk()).toBe(true);
    });
  });
});
