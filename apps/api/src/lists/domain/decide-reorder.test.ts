import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import { decideReorderOpenTasks } from './decide-reorder.js';

const groceries = { id: 'list-groceries', organizationId: 'org-123' };

const task = (overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  organizationId: 'org-123',
  createdById: 'user-456',
  createdAt: '2025-01-15T10:00:00.000Z',
  listId: groceries.id,
  ...overrides,
});

const milk = task({ id: 'task-milk', title: 'Milk', openOrder: 0 });
const eggs = task({ id: 'task-eggs', title: 'Eggs', openOrder: 1 });
const bread = task({ id: 'task-bread', title: 'Bread', openOrder: 2 });

describe('decideReorderOpenTasks', () => {
  it('reorders open tasks on a named list', () => {
    const result = decideReorderOpenTasks({
      command: {
        listId: groceries.id,
        organizationId: groceries.organizationId,
        taskIds: [eggs.id, milk.id, bread.id],
      },
      list: groceries,
      openTasks: [milk, eggs, bread],
      extraTasks: [],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.orders).toEqual([
        { id: 'task-eggs', openOrder: 0 },
        { id: 'task-milk', openOrder: 1 },
        { id: 'task-bread', openOrder: 2 },
      ]);
    }
  });

  it('refuses to reorder a completed task', () => {
    const done = { ...eggs, completedAt: '2025-01-16T10:00:00.000Z' };

    const result = decideReorderOpenTasks({
      command: {
        listId: groceries.id,
        organizationId: groceries.organizationId,
        taskIds: [milk.id, done.id, bread.id],
      },
      list: groceries,
      openTasks: [milk, bread],
      extraTasks: [done],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TASK_NOT_OPEN');
    }
  });

  it('treats an unknown or other-org list as not found', () => {
    const result = decideReorderOpenTasks({
      command: {
        listId: groceries.id,
        organizationId: 'org-123',
        taskIds: [milk.id],
      },
      list: null,
      openTasks: [],
      extraTasks: [],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('LIST_NOT_FOUND');
    }
  });

  it('refuses a set that is not the current open tasks', () => {
    const result = decideReorderOpenTasks({
      command: {
        listId: groceries.id,
        organizationId: groceries.organizationId,
        taskIds: [milk.id],
      },
      list: groceries,
      openTasks: [milk, eggs],
      extraTasks: [],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_OPEN_ORDER');
    }
  });
});

describe('decideReorderOpenTasks — unlisted pile', () => {
  const notes = task({ id: 'task-notes', title: 'Notes', listId: undefined, openOrder: 0 });
  const errand = task({ id: 'task-errand', title: 'Errand', listId: undefined, openOrder: 1 });
  const call = task({ id: 'task-call', title: 'Call', listId: undefined, openOrder: 2 });

  it('reorders open-unlisted tasks only', () => {
    const result = decideReorderOpenTasks({
      command: {
        listId: null,
        organizationId: 'org-123',
        taskIds: [errand.id, notes.id, call.id],
      },
      list: null,
      openTasks: [notes, errand, call],
      extraTasks: [],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.listId).toBeNull();
      expect(result.value.orders).toEqual([
        { id: 'task-errand', openOrder: 0 },
        { id: 'task-notes', openOrder: 1 },
        { id: 'task-call', openOrder: 2 },
      ]);
    }
  });

  it('refuses to reorder a completed unlisted task', () => {
    const done = { ...errand, completedAt: '2025-01-16T10:00:00.000Z' };

    const result = decideReorderOpenTasks({
      command: {
        listId: null,
        organizationId: 'org-123',
        taskIds: [notes.id, done.id, call.id],
      },
      list: null,
      openTasks: [notes, call],
      extraTasks: [done],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TASK_NOT_OPEN');
    }
  });

  it('does not change pin — the event is only new open-order indexes', () => {
    const pinned = { ...notes, pinnedAt: '2025-01-16T09:00:00.000Z' };

    const result = decideReorderOpenTasks({
      command: {
        listId: null,
        organizationId: 'org-123',
        taskIds: [errand.id, pinned.id],
      },
      list: null,
      openTasks: [pinned, errand],
      extraTasks: [],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'OpenTasksReordered',
        listId: null,
        organizationId: 'org-123',
        orders: [
          { id: 'task-errand', openOrder: 0 },
          { id: 'task-notes', openOrder: 1 },
        ],
      });
    }
  });

  it('refuses a listed task mixed into the unlisted pile', () => {
    const result = decideReorderOpenTasks({
      command: {
        listId: null,
        organizationId: 'org-123',
        taskIds: [notes.id, milk.id],
      },
      list: null,
      openTasks: [notes, errand],
      extraTasks: [],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_OPEN_ORDER');
    }
  });
});
