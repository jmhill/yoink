import { describe, it, expect } from 'vitest';
import { createFakeTaskStore } from './fake-task-store.js';
import { createStoreBackedPersist } from './store-backed-persist.js';
import type { Task } from '@yoink/api-contracts';

const current: Task = {
  id: 'task-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  title: 'Buy milk',
  createdAt: '2025-01-15T10:00:00.000Z',
};

describe('createStoreBackedPersist', () => {
  it('projects TaskUpdated onto the store including listId', async () => {
    const store = createFakeTaskStore({ initialTasks: [current] });
    const persist = createStoreBackedPersist(store);

    const result = await persist({
      current,
      event: {
        type: 'TaskUpdated',
        id: current.id,
        organizationId: current.organizationId,
        listId: 'list-groceries',
      },
    });

    expect(result.isOk()).toBe(true);

    const loaded = await store.findById(current.id);
    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk()) {
      expect(loaded.value?.listId).toBe('list-groceries');
      expect(loaded.value?.title).toBe('Buy milk');
    }
  });
});
