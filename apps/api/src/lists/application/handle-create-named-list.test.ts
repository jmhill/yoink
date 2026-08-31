import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { handleCreateNamedList } from './handle-create-named-list.js';
import type { PersistNamedListEvent } from './ports.js';
import { storageError } from '../domain/list-errors.js';
import type { NamedListEvent } from '../domain/events.js';

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

describe('handleCreateNamedList', () => {
  const command = {
    name: 'Groceries',
    organizationId: 'org-123',
    createdById: 'user-456',
  };

  it('persists a NamedListCreated fact and returns the projected list', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleCreateNamedList(command, {
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

  it('returns storage error when persist fails', async () => {
    const persist: PersistNamedListEvent = () => errAsync(storageError('Save failed'));

    const result = await handleCreateNamedList(command, {
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
