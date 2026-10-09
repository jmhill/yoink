import { describe, it, expect } from 'vitest';
import { createFakeListStore } from './fake-list-store.js';
import { runListStoreContractTests } from '../domain/list-store.contract.js';

describe('FakeListStore', () => {
  runListStoreContractTests({
    createHarness: () => {
      const store = createFakeListStore();
      return {
        store,
        seed: (list) => {
          store.applyInsert(list);
        },
      };
    },
  });

  describe('test-specific behavior', () => {
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
  });
});
