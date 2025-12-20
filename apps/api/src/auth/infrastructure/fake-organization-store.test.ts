import { describe, it, expect } from 'vitest';
import { createFakeOrganizationStore } from './fake-organization-store.js';
import type { Organization } from '../domain/organization.js';

const createTestOrganization = (overrides: Partial<Organization> = {}): Organization => ({
  id: 'org-123',
  name: 'Test Organization',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createFakeOrganizationStore', () => {
  describe('save', () => {
    it('persists an organization', async () => {
      const store = createFakeOrganizationStore();
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
      const store = createFakeOrganizationStore();
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

    it('returns error when configured to fail', async () => {
      const store = createFakeOrganizationStore({ shouldFailOnSave: true });
      const org = createTestOrganization();

      const result = await store.save(org);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('ORGANIZATION_STORAGE_ERROR');
      }
    });
  });

  describe('findById', () => {
    it('returns null when organization not found', async () => {
      const store = createFakeOrganizationStore();

      const result = await store.findById('non-existent');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it('returns organization from initial organizations', async () => {
      const org = createTestOrganization({ id: 'initial-org' });
      const store = createFakeOrganizationStore({ initialOrganizations: [org] });

      const result = await store.findById('initial-org');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(org);
      }
    });

    it('returns error when configured to fail', async () => {
      const store = createFakeOrganizationStore({ shouldFailOnFind: true });

      const result = await store.findById('any-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('ORGANIZATION_STORAGE_ERROR');
      }
    });
  });
});
