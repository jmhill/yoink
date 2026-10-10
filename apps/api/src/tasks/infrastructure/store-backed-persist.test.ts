import { describe, it, expect } from 'vitest';
import { createFakeTaskStore } from './fake-task-store.js';
import { createStoreBackedPersist } from './store-backed-persist.js';
import { createFakeChangeLogStore } from '../../shared/change-log/infrastructure/fake-change-log-store.js';
import { createFakeCaptureStore } from '../../captures/infrastructure/fake-capture-store.js';
import { planTaskChange } from '../domain/plan-task-change.js';
import {
  changeLogIdsForTaskUpdated,
  type TaskChangeLogIds,
} from '../domain/change-log-records.js';
import type { Task } from '@yoink/api-contracts';
import type { TaskEvent } from '../domain/events.js';

const current: Task = {
  id: 'task-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  title: 'Buy milk',
  createdAt: '2025-01-15T10:00:00.000Z',
  lastChangedAt: null,
  lastChangedBy: null,
  completedBy: null,
};

const persistOf = (
  store = createFakeTaskStore(),
  changeLog = createFakeChangeLogStore(),
  captures = createFakeCaptureStore()
) => ({
  store,
  changeLog,
  captures,
  persist: createStoreBackedPersist({ store, changeLog, captures }),
});

const persistEvent = (
  persist: ReturnType<typeof createStoreBackedPersist>,
  event: Exclude<TaskEvent, { type: 'TaskUncompleted' }>,
  currentTask: Task | null,
  ids: TaskChangeLogIds = { recordId: 'log-1' }
) => {
  const actor = { kind: 'user' as const, userId: 'user-1', via: 'session' as const };
  if (event.type === 'TaskCreated') {
    return persist(planTaskChange({ event, current: null, actor, ids }));
  }
  if (event.type === 'TaskUpdated') {
    let n = 0;
    return persist(
      planTaskChange({
        event,
        current: currentTask as Task,
        actor,
        ids: changeLogIdsForTaskUpdated(event, currentTask, () => {
          n += 1;
          return n === 1 ? ids.recordId : `${ids.recordId}-m${n}`;
        }),
      })
    );
  }
  return persist(
    planTaskChange({ event, current: currentTask as Task, actor, ids })
  );
};

describe('createStoreBackedPersist', () => {
  it('projects TaskCreated onto the store including listId', async () => {
    const store = createFakeTaskStore();
    const { persist } = persistOf(store);

    const result = await persistEvent(persist, {
      type: 'TaskCreated',
      id: 'task-new',
      organizationId: 'org-123',
      createdById: 'user-456',
      title: 'Buy milk',
      listId: 'list-groceries',
      openOrder: 0,
      createdAt: '2025-01-15T10:00:00.000Z',
      occurredAt: '2025-01-15T10:00:00.000Z',
    }, null);

    expect(result.isOk()).toBe(true);

    const loaded = await store.findById('task-new');
    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk()) {
      expect(loaded.value?.listId).toBe('list-groceries');
      expect(loaded.value?.openOrder).toBe(0);
      expect(loaded.value?.title).toBe('Buy milk');
      expect(loaded.value?.completedAt).toBeUndefined();
      expect(loaded.value?.lastChangedAt).toBe('2025-01-15T10:00:00.000Z');
    }
  });

  it('projects TaskUpdated onto the store including listId', async () => {
    const store = createFakeTaskStore({ initialTasks: [current] });
    const { persist } = persistOf(store);

    const result = await persistEvent(persist, {
      type: 'TaskUpdated',
      id: current.id,
      organizationId: current.organizationId,
      listId: 'list-groceries',
      occurredAt: '2025-01-15T11:00:00.000Z',
    }, current);

    expect(result.isOk()).toBe(true);

    const loaded = await store.findById(current.id);
    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk()) {
      expect(loaded.value?.listId).toBe('list-groceries');
      expect(loaded.value?.title).toBe('Buy milk');
    }
  });

  it('projects TaskUpdated that takes the task off a list', async () => {
    const onGroceries: Task = { ...current, listId: 'list-groceries' };
    const store = createFakeTaskStore({ initialTasks: [onGroceries] });
    const { persist } = persistOf(store);

    const result = await persistEvent(persist, {
      type: 'TaskUpdated',
      id: current.id,
      organizationId: current.organizationId,
      listId: null,
      occurredAt: '2025-01-15T11:00:00.000Z',
    }, onGroceries);

    expect(result.isOk()).toBe(true);

    const loaded = await store.findById(current.id);
    expect(loaded.isOk()).toBe(true);
    if (loaded.isOk()) {
      expect(loaded.value?.listId).toBeUndefined();
      expect(loaded.value?.title).toBe('Buy milk');
    }
  });

  it('leaves the task row unchanged when the history insert fails', async () => {
    const store = createFakeTaskStore({ initialTasks: [current] });
    const changeLog = createFakeChangeLogStore({ shouldFailOnInsert: true });
    const { persist } = persistOf(store, changeLog);

    const result = await persistEvent(persist, {
      type: 'TaskUpdated',
      id: current.id,
      organizationId: current.organizationId,
      title: 'Should not stick',
      occurredAt: '2025-01-15T11:00:00.000Z',
    }, current);

    expect(result.isErr()).toBe(true);
    const loaded = await store.findById(current.id);
    expect(loaded._unsafeUnwrap()?.title).toBe('Buy milk');
    expect(changeLog.records).toHaveLength(0);
  });

  it('rolls back the capture delete when history insert fails', async () => {
    const withCapture: Task = { ...current, captureId: 'cap-1' };
    const store = createFakeTaskStore({ initialTasks: [withCapture] });
    const changeLog = createFakeChangeLogStore({ shouldFailOnInsert: true });
    const captures = createFakeCaptureStore({
      initialCaptures: [
        {
          id: 'cap-1',
          organizationId: 'org-123',
          createdById: 'user-456',
          content: 'milk',
          status: 'processed',
          capturedAt: '2025-01-15T09:00:00.000Z',
        },
      ],
    });
    const persist = createStoreBackedPersist({ store, changeLog, captures });

    const result = await persistEvent(persist, {
      type: 'TaskDeleted',
      id: withCapture.id,
      organizationId: withCapture.organizationId,
      captureId: 'cap-1',
      deletedAt: '2025-01-15T11:00:00.000Z',
      occurredAt: '2025-01-15T11:00:00.000Z',
    }, withCapture);

    expect(result.isErr()).toBe(true);
    expect((await store.findById(withCapture.id))._unsafeUnwrap()?.title).toBe('Buy milk');
    expect((await captures.findById('cap-1'))._unsafeUnwrap()?.id).toBe('cap-1');
    expect(changeLog.records).toHaveLength(0);
  });
});
