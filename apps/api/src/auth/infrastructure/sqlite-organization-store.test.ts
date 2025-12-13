import { describe, it, expect, beforeEach } from 'vitest';
import { createSqliteOrganizationStore } from './sqlite-organization-store.js';
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
  let store: OrganizationStore;

  beforeEach(() => {
    store = createSqliteOrganizationStore({ location: ':memory:' });
  });

  describe('save', () => {
    it('persists an organization', async () => {
      const org = createTestOrganization();

      await store.save(org);

      const found = await store.findById(org.id);
      expect(found).toEqual(org);
    });
  });

  describe('findById', () => {
    it('returns organization when found', async () => {
      const org = createTestOrganization({ name: 'My Org' });
      await store.save(org);

      const found = await store.findById(org.id);

      expect(found).not.toBeNull();
      expect(found?.name).toBe('My Org');
    });

    it('returns null when organization not found', async () => {
      const found = await store.findById('non-existent-id');

      expect(found).toBeNull();
    });
  });
});
