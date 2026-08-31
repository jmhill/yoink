import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { handleDeleteNamedList } from './handle-delete-named-list.js';
import type {
  CountOpenTasksOnList,
  LoadNamedList,
  PersistNamedListEvent,
} from './ports.js';
import { storageError } from '../domain/list-errors.js';
import type { NamedListEvent } from '../domain/events.js';
import type { NamedList } from '@yoink/api-contracts';

const groceries: NamedList = {
  id: 'list-groceries',
  organizationId: 'org-123',
  createdById: 'user-456',
  name: 'Groceries',
  createdAt: '2025-01-15T10:00:00.000Z',
};

const command = {
  id: groceries.id,
  organizationId: groceries.organizationId,
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

const loadGroceries: LoadNamedList = (id) =>
  okAsync(id === groceries.id ? groceries : null);

describe('handleDeleteNamedList', () => {
  it('persists a NamedListDeleted fact when the list has no open tasks', async () => {
    const { persist, events } = createInMemoryPersist();
    const counted: string[] = [];
    const countOpenOnList: CountOpenTasksOnList = (listId) => {
      counted.push(listId);
      return okAsync(0);
    };

    const result = await handleDeleteNamedList(command, {
      load: loadGroceries,
      countOpenOnList,
      persist,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.event).toEqual({
        type: 'NamedListDeleted',
        id: 'list-groceries',
        organizationId: 'org-123',
      });
    }
    expect(counted).toEqual(['list-groceries']);
    expect(events).toEqual([
      {
        type: 'NamedListDeleted',
        id: 'list-groceries',
        organizationId: 'org-123',
      },
    ]);
  });

  it('does not persist when an open task is still on the list', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleDeleteNamedList(command, {
      load: loadGroceries,
      countOpenOnList: () => okAsync(1),
      persist,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_HAS_OPEN_TASKS');
    }
    expect(events).toHaveLength(0);
  });

  it('does not persist when the list is missing', async () => {
    const { persist, events } = createInMemoryPersist();
    let counted = false;

    const result = await handleDeleteNamedList(command, {
      load: () => okAsync(null),
      countOpenOnList: () => {
        counted = true;
        return okAsync(0);
      },
      persist,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_FOUND');
    }
    expect(counted).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('does not persist a list from another organization', async () => {
    const { persist, events } = createInMemoryPersist();
    let counted = false;

    const result = await handleDeleteNamedList(command, {
      load: () => okAsync({ ...groceries, organizationId: 'org-other' }),
      countOpenOnList: () => {
        counted = true;
        return okAsync(0);
      },
      persist,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_FOUND');
    }
    expect(counted).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('returns storage error when load fails', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleDeleteNamedList(command, {
      load: () => errAsync(storageError('Find failed')),
      countOpenOnList: () => okAsync(0),
      persist,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
    expect(events).toHaveLength(0);
  });

  it('returns storage error when counting open tasks fails', async () => {
    const { persist, events } = createInMemoryPersist();

    const result = await handleDeleteNamedList(command, {
      load: loadGroceries,
      countOpenOnList: () => errAsync(storageError('Count failed')),
      persist,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
    expect(events).toHaveLength(0);
  });

  it('returns storage error when persist fails', async () => {
    const persist: PersistNamedListEvent = () => errAsync(storageError('Delete failed'));

    const result = await handleDeleteNamedList(command, {
      load: loadGroceries,
      countOpenOnList: () => okAsync(0),
      persist,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('STORAGE_ERROR');
    }
  });
});
