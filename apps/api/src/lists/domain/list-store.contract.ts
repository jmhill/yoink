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

      it('rejects a second list with the same name ignoring case in the same organization', async () => {
        await store.save(
          createTestList({
            id: '550e8400-e29b-41d4-a716-446655440010',
            name: 'Groceries',
          })
        );

        const result = await store.save(
          createTestList({
            id: '550e8400-e29b-41d4-a716-446655440016',
            name: 'groceries',
          })
        );

        expect(result.isErr()).toBe(true);
      });

      it('allows the same name in a different organization', async () => {
        await store.save(
          createTestList({
            id: '550e8400-e29b-41d4-a716-446655440010',
            organizationId: '550e8400-e29b-41d4-a716-446655440001',
            name: 'Groceries',
          })
        );

        const result = await store.save(
          createTestList({
            id: '550e8400-e29b-41d4-a716-446655440017',
            organizationId: '550e8400-e29b-41d4-a716-446655440099',
            name: 'Groceries',
          })
        );

        expect(result.isOk()).toBe(true);
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

    describe('findById', () => {
      it('returns a saved list', async () => {
        const list = createTestList({
          id: '550e8400-e29b-41d4-a716-446655440010',
          name: 'Groceries',
        });
        await store.save(list);

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

    describe('remove', () => {
      it('deletes a saved list', async () => {
        const list = createTestList({
          id: '550e8400-e29b-41d4-a716-446655440010',
          name: 'Groceries',
        });
        await store.save(list);

        const removed = await store.remove(list.id);
        expect(removed.isOk()).toBe(true);

        const found = await store.findById(list.id);
        expect(found.isOk()).toBe(true);
        if (found.isOk()) {
          expect(found.value).toBeNull();
        }

        const listed = await store.findByOrganization(list.organizationId);
        expect(listed.isOk()).toBe(true);
        if (listed.isOk()) {
          expect(listed.value).toEqual([]);
        }
      });

      it('frees the name so it can be saved again', async () => {
        const list = createTestList({
          id: '550e8400-e29b-41d4-a716-446655440010',
          name: 'Groceries',
        });
        await store.save(list);
        await store.remove(list.id);

        const again = await store.save(
          createTestList({
            id: '550e8400-e29b-41d4-a716-446655440018',
            name: 'groceries',
          })
        );

        expect(again.isOk()).toBe(true);
      });
    });
  });
};
