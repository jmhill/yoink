import { describe, it, expect, beforeEach } from 'vitest';
import { createOrganizationService, type OrganizationService } from './organization-service.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Organization } from './organization.js';
import type { OrganizationStore } from './organization-store.js';

const TEST_DATE = new Date('2024-01-15T10:00:00.000Z');

const createTestOrg = (overrides: Partial<Organization> = {}): Organization => ({
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Organization',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('OrganizationService', () => {
  let organizationStore: OrganizationStore;
  let service: OrganizationService;

  beforeEach(() => {
    organizationStore = createFakeOrganizationStore();
    service = createOrganizationService({
      organizationStore,
      clock: createFakeClock(TEST_DATE),
      idGenerator: createFakeIdGenerator(['gen-org-id-1', 'gen-org-id-2']),
    });
  });

  describe('getOrganization', () => {
    it('returns organization when found', async () => {
      const org = createTestOrg();
      await organizationStore.save(org);

      const result = await service.getOrganization(org.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(org);
      }
    });

    it('returns null when organization not found', async () => {
      const result = await service.getOrganization('non-existent-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it('propagates storage errors', async () => {
      const failingStore = createFakeOrganizationStore({ shouldFailOnFind: true });
      const failingService = createOrganizationService({
        organizationStore: failingStore,
        clock: createFakeClock(TEST_DATE),
        idGenerator: createFakeIdGenerator([]),
      });

      const result = await failingService.getOrganization('any-id');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('ORGANIZATION_STORAGE_ERROR');
      }
    });
  });

  describe('listOrganizations', () => {
    it('returns all organizations', async () => {
      const org1 = createTestOrg({ id: 'org-1', name: 'Org 1' });
      const org2 = createTestOrg({ id: 'org-2', name: 'Org 2' });
      await organizationStore.save(org1);
      await organizationStore.save(org2);

      const result = await service.listOrganizations();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value.map((o) => o.id)).toContain('org-1');
        expect(result.value.map((o) => o.id)).toContain('org-2');
      }
    });

    it('returns empty array when no organizations exist', async () => {
      const result = await service.listOrganizations();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('createOrganization', () => {
    it('creates and returns a new organization', async () => {
      const result = await service.createOrganization({ name: 'New Org' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('gen-org-id-1');
        expect(result.value.name).toBe('New Org');
        expect(result.value.createdAt).toBe(TEST_DATE.toISOString());
      }

      // Verify it's persisted
      const findResult = await service.getOrganization('gen-org-id-1');
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value?.name).toBe('New Org');
      }
    });

    it('uses provided id if given', async () => {
      const result = await service.createOrganization({
        id: 'custom-org-id',
        name: 'Custom ID Org',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('custom-org-id');
      }
    });

    it('uses provided createdAt if given', async () => {
      const customDate = '2023-06-15T12:00:00.000Z';
      const result = await service.createOrganization({
        name: 'Custom Date Org',
        createdAt: customDate,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.createdAt).toBe(customDate);
      }
    });

    it('propagates storage errors on save', async () => {
      const failingStore = createFakeOrganizationStore({ shouldFailOnSave: true });
      const failingService = createOrganizationService({
        organizationStore: failingStore,
        clock: createFakeClock(TEST_DATE),
        idGenerator: createFakeIdGenerator(['gen-id']),
      });

      const result = await failingService.createOrganization({ name: 'Will Fail' });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('ORGANIZATION_STORAGE_ERROR');
      }
    });
  });
});
