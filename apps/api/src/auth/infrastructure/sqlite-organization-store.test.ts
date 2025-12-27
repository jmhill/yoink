import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createSqliteOrganizationStore } from './sqlite-organization-store.js';
import { createTestDatabase, type Database } from '../../database/test-utils.js';
import type { Organization } from '../domain/organization.js';
import type { OrganizationStore } from '../domain/organization-store.js';

const createTestOrganization = (
  overrides: Partial<Organization> = {}
): Organization => ({
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Organization',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createSqliteOrganizationStore', () => {
  let db: Database;
  let store: OrganizationStore;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clear data between tests
    await db.execute({ sql: 'DELETE FROM api_tokens' });
    await db.execute({ sql: 'DELETE FROM captures' });
    await db.execute({ sql: 'DELETE FROM users' });
    await db.execute({ sql: 'DELETE FROM organizations' });

    store = await createSqliteOrganizationStore(db);
  });

  describe('save', () => {
    it('persists an organization', async () => {
      const org = createTestOrganization();

      const saveResult = await store.save(org);

      expect(saveResult.isOk()).toBe(true);

      const findResult = await store.findById(org.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toEqual(org);
      }
    });

    it('updates an existing organization', async () => {
      const org = createTestOrganization({ name: 'Original Name' });
      await store.save(org);

      const updated = { ...org, name: 'Updated Name' };
      const updateResult = await store.save(updated);

      expect(updateResult.isOk()).toBe(true);

      const findResult = await store.findById(org.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.name).toBe('Updated Name');
      }
    });
  });

  describe('findById', () => {
    it('returns organization when found', async () => {
      const org = createTestOrganization({ name: 'My Org' });
      await store.save(org);

      const result = await store.findById(org.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value?.name).toBe('My Org');
      }
    });

    it('returns null when organization not found', async () => {
      const result = await store.findById('non-existent-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('findAll', () => {
    it('returns empty array when no organizations exist', async () => {
      const result = await store.findAll();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('returns all organizations ordered by createdAt desc', async () => {
      const org1 = createTestOrganization({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'First Org',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
      const org2 = createTestOrganization({
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Second Org',
        createdAt: '2024-02-01T00:00:00.000Z',
      });
      await store.save(org1);
      await store.save(org2);

      const result = await store.findAll();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].name).toBe('Second Org');
        expect(result.value[1].name).toBe('First Org');
      }
    });
  });
});
