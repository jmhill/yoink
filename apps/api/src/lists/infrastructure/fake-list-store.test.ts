import { describe, it, expect } from 'vitest';
import { createFakeListStore } from './fake-list-store.js';
import { runListStoreContractTests } from '../domain/list-store.contract.js';

describe('FakeListStore', () => {
  runListStoreContractTests({
    createStore: () => createFakeListStore(),
  });

  describe('test-specific behavior', () => {
    it('returns Err on save when configured to fail', async () => {
      const store = createFakeListStore({ shouldFailOnSave: true });

      const result = await store.save({
        id: '550e8400-e29b-41d4-a716-446655440010',
        organizationId: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Groceries',
        createdAt: '2025-01-15T10:00:00.000Z',
        createdById: '550e8400-e29b-41d4-a716-446655440002',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('STORAGE_ERROR');
      }
    });

    it('returns Err on find when configured to fail', async () => {
      const store = createFakeListStore({ shouldFailOnFind: true });

      const result = await store.findByOrganization(
        '550e8400-e29b-41d4-a716-446655440001'
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('STORAGE_ERROR');
      }
    });

    it('returns Err on remove when configured to fail', async () => {
      const store = createFakeListStore({ shouldFailOnRemove: true });

      const result = await store.remove('550e8400-e29b-41d4-a716-446655440010');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('STORAGE_ERROR');
      }
    });
  });
});
