import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import { createFakeListStore } from './fake-list-store.js';
import { createFakeTaskStore } from '../../tasks/infrastructure/fake-task-store.js';
import { createFakeChangeLogStore } from '../../shared/change-log/infrastructure/fake-change-log-store.js';
import { createStoreBackedPersist } from './store-backed-persist.js';
import { planListChange } from '../domain/plan-list-change.js';

const groceriesList = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  createdById: '550e8400-e29b-41d4-a716-446655440002',
  name: 'Groceries',
  createdAt: '2025-01-15T10:00:00.000Z',
};

const lastChanged = {
  lastChangedAt: null,
  lastChangedBy: null,
  completedBy: null,
} as const;

describe('createStoreBackedPersist', () => {
  it('projects NamedListCreated onto the store', async () => {
    const store = createFakeListStore();
    const persist = createStoreBackedPersist({
      store,
      changeLog: createFakeChangeLogStore(),
      tasks: createFakeTaskStore(),
    });

    const result = await persist(
      planListChange({
        event: {
          type: 'NamedListCreated',
          id: groceriesList.id,
          organizationId: groceriesList.organizationId,
          createdById: groceriesList.createdById,
          name: groceriesList.name,
          createdAt: groceriesList.createdAt,
          occurredAt: groceriesList.createdAt,
        },
        current: null,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
        ids: { recordId: 'log-1' },
      })
    );

    expect(result.isOk()).toBe(true);

    const loaded = await store.findByOrganization(groceriesList.organizationId);
    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk()) {
      expect(loaded.value).toEqual([groceriesList]);
    }
  });

  it('projects NamedListRenamed onto the store without touching other fields', async () => {
    const store = createFakeListStore({ initialLists: [groceriesList] });
    const persist = createStoreBackedPersist({
      store,
      changeLog: createFakeChangeLogStore(),
      tasks: createFakeTaskStore(),
    });

    const result = await persist(
      planListChange({
        event: {
          type: 'NamedListRenamed',
          id: groceriesList.id,
          organizationId: groceriesList.organizationId,
          name: 'Shopping',
          occurredAt: '2025-01-15T10:00:00.000Z',
        },
        current: groceriesList,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
        ids: { recordId: 'log-1' },
      })
    );

    expect(result.isOk()).toBe(true);

    const loaded = await store.findById(groceriesList.id);
    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk()) {
      expect(loaded.value).toEqual({
        ...groceriesList,
        name: 'Shopping',
      });
    }
  });

  it('clears completed tasks’ listId then removes the list on NamedListDeleted', async () => {
    const store = createFakeListStore({ initialLists: [groceriesList] });
    const doneOnList: Task = {
      id: 'task-done',
      organizationId: groceriesList.organizationId,
      createdById: groceriesList.createdById,
      title: 'Buy milk',
      createdAt: '2025-01-15T10:00:00.000Z',
      completedAt: '2025-01-15T11:00:00.000Z',
      listId: groceriesList.id,
      ...lastChanged,
    };
    const openOnOther: Task = {
      id: 'task-open',
      organizationId: groceriesList.organizationId,
      createdById: groceriesList.createdById,
      title: 'Still open elsewhere',
      createdAt: '2025-01-15T10:00:00.000Z',
      listId: 'list-other',
      ...lastChanged,
    };
    const taskStore = createFakeTaskStore({
      initialTasks: [doneOnList, openOnOther],
    });
    const persist = createStoreBackedPersist({
      store,
      changeLog: createFakeChangeLogStore(),
      tasks: taskStore,
    });

    const result = await persist(
      planListChange({
        event: {
          type: 'NamedListDeleted',
          id: groceriesList.id,
          organizationId: groceriesList.organizationId,
          occurredAt: '2025-01-15T10:00:00.000Z',
        },
        current: groceriesList,
        actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
        ids: { recordId: 'log-1' },
      })
    );

    expect(result.isOk()).toBe(true);

    const loaded = await store.findById(groceriesList.id);
    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk()) {
      expect(loaded.value).toBeNull();
    }

    const done = await taskStore.findById('task-done');
    expect(done.isOk()).toBe(true);
    if (done.isOk()) {
      expect(done.value?.listId).toBeUndefined();
      expect(done.value?.completedAt).toBe('2025-01-15T11:00:00.000Z');
    }

    const other = await taskStore.findById('task-open');
    expect(other.isOk()).toBe(true);
    if (other.isOk()) {
      expect(other.value?.listId).toBe('list-other');
    }
  });
});
