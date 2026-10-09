import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { handleRenameNamedList } from './handle-rename-named-list.js';
import type { ListNamedLists, LoadNamedList, PersistNamedListEvent } from './ports.js';
import { storageError } from '../domain/list-errors.js';
import type { ListEvent } from '../domain/events.js';
import type { NamedList } from '@yoink/api-contracts';

const groceries: NamedList = {
  id: 'list-groceries',
  organizationId: 'org-123',
  createdById: 'user-456',
  name: 'groceries',
  createdAt: '2025-01-15T10:00:00.000Z',
};

const weekend: NamedList = {
  id: 'list-weekend',
  organizationId: 'org-123',
  createdById: 'user-456',
  name: 'Weekend',
  createdAt: '2025-01-15T09:00:00.000Z',
};

const command = {
  id: groceries.id,
  organizationId: groceries.organizationId,
  name: 'Shopping',
};

const createInMemoryPersist = (): {
  persist: PersistNamedListEvent;
  events: ListEvent[];
} => {
  const events: ListEvent[] = [];
  return {
    events,
    persist: ({ event }) => {
      events.push(event);
      return okAsync(undefined);
    },
  };
};

const loadGroceries: LoadNamedList = (id) =>
  okAsync(id === groceries.id ? groceries : null);

const listOrg: ListNamedLists = () => okAsync([weekend, groceries]);

describe('handleRenameNamedList', () => {
  it('persists a NamedListRenamed fact and returns the projected list', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleRenameNamedList(command, {
      load: loadGroceries,
      list: listOrg,
      persist,
      now: () => '2025-01-15T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event).toEqual({
        type: 'NamedListRenamed',
        id: 'list-groceries',
        organizationId: 'org-123',
        name: 'Shopping',
      });
      expect(result.value.view).toEqual({
        ...groceries,
        name: 'Shopping',
      });
    }
    expect(events).toEqual([
      {
        type: 'NamedListRenamed',
        id: 'list-groceries',
        organizationId: 'org-123',
        name: 'Shopping',
      },
    ]);
  });

  it('does not persist when the name is empty', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleRenameNamedList(
      { ...command, name: '' },
      {
        load: loadGroceries,
        list: listOrg,
        persist,
      now: () => '2025-01-15T10:00:00.000Z',
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_LIST_NAME');
    }
    expect(events).toHaveLength(0);
  });

  it('does not persist when another list already has the name ignoring case', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleRenameNamedList(
      { ...command, name: 'weekend' },
      {
        load: loadGroceries,
        list: listOrg,
        persist,
      now: () => '2025-01-15T10:00:00.000Z',
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_LIST_NAME');
    }
    expect(events).toHaveLength(0);
  });

  it('persists a capitalization-only change of its own name', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleRenameNamedList(
      { ...command, name: 'Groceries' },
      {
        load: loadGroceries,
        list: listOrg,
        persist,
      now: () => '2025-01-15T10:00:00.000Z',
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.view.name).toBe('Groceries');
    }
    expect(events).toHaveLength(1);
  });

  it('does not persist when the list is missing', async () => {
    const { persist, events } = createInMemoryPersist();
    let listed = false;

    const result = await handleRenameNamedList(command, {
      load: () => okAsync(null),
      list: () => {
        listed = true;
        return okAsync([]);
      },
      persist,
      now: () => '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_FOUND');
    }
    expect(listed).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('does not persist a list from another organization', async () => {
    const { persist, events } = createInMemoryPersist();
    let listed = false;

    const result = await handleRenameNamedList(command, {
      load: () => okAsync({ ...groceries, organizationId: 'org-other' }),
      list: () => {
        listed = true;
        return okAsync([]);
      },
      persist,
      now: () => '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_FOUND');
    }
    expect(listed).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('returns storage error when load fails', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleRenameNamedList(command, {
      load: () => errAsync(storageError('Find failed')),
      list: listOrg,
      persist,
      now: () => '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
    expect(events).toHaveLength(0);
  });

  it('returns storage error when listing existing names fails', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleRenameNamedList(command, {
      load: loadGroceries,
      list: () => errAsync(storageError('List failed')),
      persist,
      now: () => '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
    expect(events).toHaveLength(0);
  });

  it('returns storage error when persist fails', async () => {
    const persist: PersistNamedListEvent = () => errAsync(storageError('Update failed'));

    const result = await handleRenameNamedList(command, {
      load: loadGroceries,
      list: listOrg,
      persist,
      now: () => '2025-01-15T10:00:00.000Z',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });
});
