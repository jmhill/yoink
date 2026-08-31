import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import { handleCreateTask } from './handle-create-task.js';
import type { LoadNamedList, PersistTaskEvent } from './ports.js';
import { storageError } from '../domain/task-errors.js';
import type { TaskEvent } from '../domain/events.js';
import type { OrgPrincipalLookup } from '../domain/org-principal-lookup.js';

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

const command = {
  title: 'Buy milk',
  organizationId: 'org-123',
  createdById: 'user-456',
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

describe('handleCreateTask', () => {
  it('persists a TaskCreated fact already on a named list', async () => {
    const { persist, events } = createInMemoryPersist();
    const loadList: LoadNamedList = (id) =>
      okAsync(id === groceries.id ? groceries : null);

    const result = await handleCreateTask(
      { ...command, listId: groceries.id },
      {
        loadList,
        persist,
        nextId: () => 'task-id-1',
        now: () => '2025-01-15T10:00:00.000Z',
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event?.type).toBe('TaskCreated');
      expect(result.value.event?.listId).toBe('list-groceries');
      expect(result.value.view.listId).toBe('list-groceries');
      expect(result.value.view.title).toBe('Buy milk');
      expect(result.value.view.completedAt).toBeUndefined();
    }
    expect(events).toHaveLength(1);
  });

  it('creates an unlisted task when no list is given', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleCreateTask(command, {
      loadList: () => okAsync(null),
      persist,
      nextId: () => 'task-id-1',
      now: () => '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.view.listId).toBeUndefined();
      expect(result.value.event?.listId).toBeUndefined();
    }
    expect(events).toHaveLength(1);
  });

  it('does not persist when the list is unknown', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleCreateTask(
      { ...command, listId: 'list-missing' },
      {
        loadList: () => okAsync(null),
        persist,
        nextId: () => 'task-id-1',
        now: () => '2025-01-15T10:00:00.000Z',
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_IN_ORGANIZATION');
    }
    expect(events).toHaveLength(0);
  });

  it('does not persist when the list belongs to another organization', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleCreateTask(
      { ...command, listId: otherOrgList.id },
      {
        loadList: () => okAsync(otherOrgList),
        persist,
        nextId: () => 'task-id-1',
        now: () => '2025-01-15T10:00:00.000Z',
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_IN_ORGANIZATION');
    }
    expect(events).toHaveLength(0);
  });

  it('returns storage error when persist fails', async () => {
    const persist: PersistTaskEvent = () => errAsync(storageError('Save failed'));

    const result = await handleCreateTask(
      { ...command, listId: groceries.id },
      {
        loadList: () => okAsync(groceries),
        persist,
        nextId: () => 'task-id-1',
        now: () => '2025-01-15T10:00:00.000Z',
      }
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

    const result = await handleCreateTask(
      { ...command, assigneeId: 'outsider' },
      {
        loadList: () => okAsync(null),
        persist,
        principalLookup,
        nextId: () => 'task-id-1',
        now: () => '2025-01-15T10:00:00.000Z',
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('ASSIGNEE_NOT_IN_ORGANIZATION');
    }
    expect(events).toHaveLength(0);
  });
});
