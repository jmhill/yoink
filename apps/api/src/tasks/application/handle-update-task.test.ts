import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import type { NamedList, Task } from '@yoink/api-contracts';
import { handleUpdateTask } from './handle-update-task.js';
import type { LoadNamedList, PersistTaskEvent } from './ports.js';
import { storageError } from '../domain/task-errors.js';
import type { TaskEvent } from '../domain/events.js';
import type { OrgPrincipalLookup } from '../domain/org-principal-lookup.js';

const current: Task = {
  id: 'task-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  title: 'Buy milk',
  createdAt: '2025-01-15T10:00:00.000Z',
};

const groceries: NamedList = {
  id: 'list-groceries',
  organizationId: 'org-123',
  createdById: 'user-456',
  name: 'Groceries',
  createdAt: '2025-01-15T09:00:00.000Z',
};

const otherOrgList: NamedList = {
  id: 'list-other',
  organizationId: 'org-other',
  createdById: 'user-other',
  name: 'Other',
  createdAt: '2025-01-15T09:00:00.000Z',
};

const createInMemoryPersist = (): {
  persist: PersistTaskEvent;
  events: TaskEvent[];
} => {
  const events: TaskEvent[] = [];
  return {
    events,
    persist: ({ event }) => {
      events.push(event);
      return okAsync(undefined);
    },
  };
};

const loadCurrent = () => okAsync(current);

describe('handleUpdateTask', () => {
  it('persists a TaskUpdated fact that puts the task on a list', async () => {
    const { persist, events } = createInMemoryPersist();
    const loadList: LoadNamedList = (id) =>
      okAsync(id === groceries.id ? groceries : null);

    const result = await handleUpdateTask(
      {
        id: current.id,
        organizationId: current.organizationId,
        listId: groceries.id,
      },
      { load: loadCurrent, loadList, persist }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event).not.toBeNull();
      expect(result.value.event?.type).toBe('TaskUpdated');
      expect(result.value.event?.listId).toBe('list-groceries');
      expect(result.value.view.listId).toBe('list-groceries');
      expect(result.value.view.title).toBe('Buy milk');
    }
    expect(events).toHaveLength(1);
  });

  it('does not persist when the list is unknown', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleUpdateTask(
      {
        id: current.id,
        organizationId: current.organizationId,
        listId: 'list-missing',
      },
      { load: loadCurrent, loadList: () => okAsync(null), persist }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_IN_ORGANIZATION');
    }
    expect(events).toHaveLength(0);
  });

  it('does not persist when the list belongs to another organization', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleUpdateTask(
      {
        id: current.id,
        organizationId: current.organizationId,
        listId: otherOrgList.id,
      },
      { load: loadCurrent, loadList: () => okAsync(otherOrgList), persist }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_IN_ORGANIZATION');
    }
    expect(events).toHaveLength(0);
  });

  it('returns not found when the task is missing', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleUpdateTask(
      {
        id: 'missing',
        organizationId: current.organizationId,
        listId: groceries.id,
      },
      { load: () => okAsync(null), loadList: () => okAsync(groceries), persist }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TASK_NOT_FOUND');
    }
    expect(events).toHaveLength(0);
  });

  it('does not persist when putting the task on the same list again', async () => {
    const onGroceries: Task = { ...current, listId: groceries.id };
    const { persist, events } = createInMemoryPersist();

    const result = await handleUpdateTask(
      {
        id: onGroceries.id,
        organizationId: onGroceries.organizationId,
        listId: groceries.id,
      },
      { load: () => okAsync(onGroceries), loadList: () => okAsync(groceries), persist }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event).toBeNull();
      expect(result.value.view.listId).toBe(groceries.id);
    }
    expect(events).toHaveLength(0);
  });

  it('does not persist when adding a completed task to a list', async () => {
    const completed: Task = {
      ...current,
      completedAt: '2025-01-16T10:00:00.000Z',
    };
    const { persist, events } = createInMemoryPersist();

    const result = await handleUpdateTask(
      {
        id: completed.id,
        organizationId: completed.organizationId,
        listId: groceries.id,
      },
      { load: () => okAsync(completed), loadList: () => okAsync(groceries), persist }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TASK_NOT_OPEN');
    }
    expect(events).toHaveLength(0);
  });

  it('returns storage error when persist fails', async () => {
    const persist: PersistTaskEvent = () => errAsync(storageError('Save failed'));

    const result = await handleUpdateTask(
      {
        id: current.id,
        organizationId: current.organizationId,
        listId: groceries.id,
      },
      { load: loadCurrent, loadList: () => okAsync(groceries), persist }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });

  it('rejects an assignee who is not in the organization', async () => {
    const { persist, events } = createInMemoryPersist();
    const principalLookup: OrgPrincipalLookup = {
      existsInOrganization: () => okAsync(false),
    };

    const result = await handleUpdateTask(
      {
        id: current.id,
        organizationId: current.organizationId,
        assigneeId: 'outsider',
      },
      {
        load: loadCurrent,
        loadList: () => okAsync(null),
        persist,
        principalLookup,
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('ASSIGNEE_NOT_IN_ORGANIZATION');
    }
    expect(events).toHaveLength(0);
  });
});
