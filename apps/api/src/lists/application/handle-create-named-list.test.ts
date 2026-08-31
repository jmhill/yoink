import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { handleCreateNamedList } from './handle-create-named-list.js';
import type { ListNamedLists, PersistNamedListEvent } from './ports.js';
import { storageError } from '../domain/list-errors.js';
import type { NamedListEvent } from '../domain/events.js';
import type { NamedList } from '@yoink/api-contracts';

const groceries: NamedList = {
  id: 'list-existing',
  organizationId: 'org-123',
  createdById: 'user-456',
  name: 'Groceries',
  createdAt: '2025-01-15T09:00:00.000Z',
};

const createInMemoryPersist = (): {
  persist: PersistNamedListEvent;
  events: NamedListEvent[];
} => {
  const events: NamedListEvent[] = [];
  return {
    events,
    persist: ({ event }) => {
      events.push(event);
      return okAsync(undefined);
    },
  };
};

const emptyList: ListNamedLists = () => okAsync([]);

describe('handleCreateNamedList', () => {
  const command = {
    name: 'Groceries',
    organizationId: 'org-123',
    createdById: 'user-456',
  };

  it('persists a NamedListCreated fact and returns the projected list', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleCreateNamedList(command, {
      list: emptyList,
      persist,
      nextId: () => 'list-id-1',
      now: () => '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event).toEqual({
        type: 'NamedListCreated',
        id: 'list-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        name: 'Groceries',
        createdAt: '2025-01-15T10:00:00.000Z',
      });
      expect(result.value.view).toEqual({
        id: 'list-id-1',
        organizationId: 'org-123',
        createdById: 'user-456',
        name: 'Groceries',
        createdAt: '2025-01-15T10:00:00.000Z',
      });
    }
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('NamedListCreated');
  });

  it('does not persist when the name is empty', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleCreateNamedList(
      { ...command, name: '' },
      {
        list: emptyList,
        persist,
        nextId: () => 'list-id-1',
        now: () => '2025-01-15T10:00:00.000Z',
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_LIST_NAME');
    }
    expect(events).toHaveLength(0);
  });

  it('does not persist when the name is already used ignoring case', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleCreateNamedList(
      { ...command, name: 'groceries' },
      {
        list: () => okAsync([groceries]),
        persist,
        nextId: () => 'list-id-2',
        now: () => '2025-01-15T10:00:00.000Z',
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_LIST_NAME');
    }
    expect(events).toHaveLength(0);
  });

  it('returns storage error when listing existing names fails', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleCreateNamedList(command, {
      list: () => errAsync(storageError('Find failed')),
      persist,
      nextId: () => 'list-id-1',
      now: () => '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
    expect(events).toHaveLength(0);
  });

  it('returns storage error when persist fails', async () => {
    const persist: PersistNamedListEvent = () => errAsync(storageError('Save failed'));

    const result = await handleCreateNamedList(command, {
      list: emptyList,
      persist,
      nextId: () => 'list-id-1',
      now: () => '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });
});
