import { describe, it, expect, beforeEach } from 'vitest';
import type { NamedList } from '@yoink/api-contracts';
import type { ListStore } from './list-store.js';

const createTestList = (overrides: Partial<NamedList> = {}): NamedList => ({
  id: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Groceries',
  createdAt: '2025-01-15T10:00:00.000Z',
  createdById: '550e8400-e29b-41d4-a716-446655440002',
  ...overrides,
});

export type ListStoreHarness = {
  store: ListStore;
  seed: (list: NamedList) => void | Promise<void>;
};

export type ListStoreContractOptions = {
  createHarness: () => ListStoreHarness | Promise<ListStoreHarness>;
  beforeEach?: () => void | Promise<void>;
};

export const runListStoreContractTests = (options: ListStoreContractOptions) => {
  let store: ListStore;
  let seed: ListStoreHarness['seed'];

  beforeEach(async () => {
    if (options.beforeEach) await options.beforeEach();
    const harness = await options.createHarness();
    store = harness.store;
    seed = harness.seed;
  });

  describe('ListStore Contract', () => {
    describe('findByOrganization', () => {
      it('returns lists for that organization only', async () => {
        const org1 = createTestList({
          id: '550e8400-e29b-41d4-a716-446655440011',
          organizationId: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Org 1 list',
        });
        const org2 = createTestList({
          id: '550e8400-e29b-41d4-a716-446655440012',
          organizationId: '550e8400-e29b-41d4-a716-446655440099',
          name: 'Org 2 list',
        });

        await seed(org1);
        await seed(org2);

        const result = await store.findByOrganization(org1.organizationId);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toHaveLength(1);
          expect(result.value[0].name).toBe('Org 1 list');
        }
      });

      it('includes empty lists — every named list in the org, not only those with tasks', async () => {
        const empty = createTestList({
          id: '550e8400-e29b-41d4-a716-446655440013',
          name: 'Empty bucket',
        });
        await seed(empty);

        const result = await store.findByOrganization(empty.organizationId);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.map((list) => list.name)).toContain('Empty bucket');
        }
      });

      it('returns lists sorted by name', async () => {
        await seed(
          createTestList({
            id: '550e8400-e29b-41d4-a716-446655440014',
            name: 'Zebra',
            createdAt: '2025-01-15T09:00:00.000Z',
          })
        );
        await seed(
          createTestList({
            id: '550e8400-e29b-41d4-a716-446655440015',
            name: 'Apple',
            createdAt: '2025-01-15T11:00:00.000Z',
          })
        );

        const result = await store.findByOrganization(
          '550e8400-e29b-41d4-a716-446655440001'
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.map((list) => list.name)).toEqual(['Apple', 'Zebra']);
        }
      });

      it('returns an empty array when the organization has no lists', async () => {
        const result = await store.findByOrganization(
          '550e8400-e29b-41d4-a716-446655440088'
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toEqual([]);
        }
      });
    });

    describe('findById', () => {
      it('returns a saved list', async () => {
        const list = createTestList({
          id: '550e8400-e29b-41d4-a716-446655440010',
          name: 'Groceries',
        });
        await seed(list);

        const result = await store.findById(list.id);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toEqual(list);
        }
      });

      it('returns null when the list does not exist', async () => {
        const result = await store.findById('550e8400-e29b-41d4-a716-446655440099');

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toBeNull();
        }
      });
    });
  });
};
