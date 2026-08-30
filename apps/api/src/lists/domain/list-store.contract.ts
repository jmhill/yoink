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

export type ListStoreContractOptions = {
  createStore: () => ListStore | Promise<ListStore>;
  beforeEach?: () => void | Promise<void>;
};

export const runListStoreContractTests = (options: ListStoreContractOptions) => {
  let store: ListStore;

  beforeEach(async () => {
    if (options.beforeEach) await options.beforeEach();
    store = await options.createStore();
  });

  describe('ListStore Contract', () => {
    describe('save', () => {
      it('persists a named list', async () => {
        const list = createTestList({
          id: '550e8400-e29b-41d4-a716-446655440010',
          name: 'Weekend',
        });

        const saveResult = await store.save(list);
        expect(saveResult.isOk()).toBe(true);

        const findResult = await store.findByOrganization(list.organizationId);
        expect(findResult.isOk()).toBe(true);
        if (findResult.isOk()) {
          expect(findResult.value).toHaveLength(1);
          expect(findResult.value[0]).toEqual(list);
        }
      });
    });

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

        await store.save(org1);
        await store.save(org2);

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
        await store.save(empty);

        const result = await store.findByOrganization(empty.organizationId);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.map((list) => list.name)).toContain('Empty bucket');
        }
      });

      it('returns lists sorted by name', async () => {
        await store.save(
          createTestList({
            id: '550e8400-e29b-41d4-a716-446655440014',
            name: 'Zebra',
            createdAt: '2025-01-15T09:00:00.000Z',
          })
        );
        await store.save(
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
  });
};
