import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { handleCreateNamedList } from './handle-create-named-list.js';
import type { ListNamedLists, PersistNamedListChange } from './ports.js';
import { storageError } from '../domain/list-errors.js';
import type { ListEvent } from '../domain/events.js';
import type { NamedList } from '@yoink/api-contracts';

const groceries: NamedList = {
  id: 'list-existing',
  organizationId: 'org-123',
  createdById: 'user-456',
  name: 'Groceries',
  createdAt: '2025-01-15T09:00:00.000Z',
};

const createInMemoryPersist = (): {
  persist: PersistNamedListChange;
  events: ListEvent[];
} => {
  const events: ListEvent[] = [];
  return {
    events,
    persist: (plan) => {
      events.push({ type: plan.records[0]?.kind } as ListEvent);
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
    actor: { kind: 'user' as const, userId: 'user-1', via: 'session' as const },
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
        occurredAt: '2025-01-15T10:00:00.000Z',
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
    const persist: PersistNamedListChange = () => errAsync(storageError('Save failed'));

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
