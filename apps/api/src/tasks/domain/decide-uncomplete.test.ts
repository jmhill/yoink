import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import { decideUncompleteTask } from './decide-uncomplete.js';

const task = (overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  organizationId: 'org-123',
  createdById: 'user-456',
  createdAt: '2025-01-15T10:00:00.000Z',
  listId: 'list-groceries',
  ...overrides,
});

const current = task({
  id: 'task-b',
  title: 'Eggs',
  openOrder: 1,
  completedAt: '2025-01-16T10:00:00.000Z',
});

describe('decideUncompleteTask', () => {
  it('restores a completed task at its remembered open-order index', () => {
    const result = decideUncompleteTask({
      current,
      command: { id: current.id, organizationId: current.organizationId },
      openSiblings: [
        task({ id: 'task-a', title: 'Milk', openOrder: 0 }),
        task({ id: 'task-c', title: 'Bread', openOrder: 2 }),
      ],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'TaskUncompleted') {
      expect(result.value.openOrder).toBe(1);
      expect(result.value.siblingOrders).toEqual([
        { id: 'task-a', openOrder: 0 },
        { id: 'task-c', openOrder: 2 },
      ]);
    }
  });

  it('clamps to the end when the open list is now shorter', () => {
    const result = decideUncompleteTask({
      current: { ...current, openOrder: 4 },
      command: { id: current.id, organizationId: current.organizationId },
      openSiblings: [task({ id: 'task-a', title: 'Milk', openOrder: 0 })],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.type === 'TaskUncompleted') {
      expect(result.value.openOrder).toBe(1);
      expect(result.value.siblingOrders).toEqual([{ id: 'task-a', openOrder: 0 }]);
    }
  });

  it('is a noop when the task is already open', () => {
    const result = decideUncompleteTask({
      current: task({ id: 'task-b', title: 'Eggs', openOrder: 1 }),
      command: { id: current.id, organizationId: current.organizationId },
      openSiblings: [],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ type: 'Noop' });
    }
  });
});
