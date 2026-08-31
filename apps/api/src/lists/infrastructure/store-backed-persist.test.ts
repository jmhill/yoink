import { describe, it, expect } from 'vitest';
import { createFakeListStore } from './fake-list-store.js';
import { createStoreBackedPersist } from './store-backed-persist.js';

describe('createStoreBackedPersist', () => {
  it('projects NamedListCreated onto the store', async () => {
    const store = createFakeListStore();
    const persist = createStoreBackedPersist(store);

    const result = await persist({
      event: {
        type: 'NamedListCreated',
        id: '550e8400-e29b-41d4-a716-446655440010',
        organizationId: '550e8400-e29b-41d4-a716-446655440001',
        createdById: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Groceries',
        createdAt: '2025-01-15T10:00:00.000Z',
      },
    });

    expect(result.isOk()).toBe(true);

    const loaded = await store.findByOrganization(
      '550e8400-e29b-41d4-a716-446655440001'
    );
    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk()) {
      expect(loaded.value).toEqual([
        {
          id: '550e8400-e29b-41d4-a716-446655440010',
          organizationId: '550e8400-e29b-41d4-a716-446655440001',
          createdById: '550e8400-e29b-41d4-a716-446655440002',
          name: 'Groceries',
          createdAt: '2025-01-15T10:00:00.000Z',
        },
      ]);
    }
  });
});
