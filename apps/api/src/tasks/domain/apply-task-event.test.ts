import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import { applyTaskEvent } from './apply-task-event.js';

const current: Task = {
  id: 'task-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  title: 'Buy milk',
  createdAt: '2025-01-15T10:00:00.000Z',
};

describe('applyTaskEvent', () => {
  it('projects a newly created task already on a list', () => {
    const view = applyTaskEvent(null, {
      type: 'TaskCreated',
      id: 'task-new',
      organizationId: 'org-123',
      createdById: 'user-456',
      title: 'Buy milk',
      listId: 'list-groceries',
      openOrder: 0,
      createdAt: '2025-01-15T10:00:00.000Z',
    });

    expect(view).toEqual({
      id: 'task-new',
      organizationId: 'org-123',
      createdById: 'user-456',
      title: 'Buy milk',
      listId: 'list-groceries',
      openOrder: 0,
      createdAt: '2025-01-15T10:00:00.000Z',
    });
    expect(view.completedAt).toBeUndefined();
  });

  it('projects a newly created unlisted task', () => {
    const view = applyTaskEvent(null, {
      type: 'TaskCreated',
      id: 'task-new',
      organizationId: 'org-123',
      createdById: 'user-456',
      title: 'Loose end',
      openOrder: 0,
      createdAt: '2025-01-15T10:00:00.000Z',
    });

    expect(view.listId).toBeUndefined();
    expect(view.title).toBe('Loose end');
  });

  it('projects a list onto an unlisted task', () => {
    const view = applyTaskEvent(current, {
      type: 'TaskUpdated',
      id: current.id,
      organizationId: current.organizationId,
      listId: 'list-groceries',
      openOrder: 2,
    });

    expect(view.listId).toBe('list-groceries');
    expect(view.openOrder).toBe(2);
    expect(view.title).toBe('Buy milk');
  });

  it('moves the task onto another list', () => {
    const onGroceries: Task = { ...current, listId: 'list-groceries' };

    const view = applyTaskEvent(onGroceries, {
      type: 'TaskUpdated',
      id: current.id,
      organizationId: current.organizationId,
      listId: 'list-weekend',
      openOrder: 0,
    });

    expect(view.listId).toBe('list-weekend');
    expect(view.openOrder).toBe(0);
  });

  it('clears the list when the event takes the task off', () => {
    const onGroceries: Task = { ...current, listId: 'list-groceries' };

    const view = applyTaskEvent(onGroceries, {
      type: 'TaskUpdated',
      id: current.id,
      organizationId: current.organizationId,
      listId: null,
      openOrder: 3,
    });

    expect(view.listId).toBeUndefined();
    expect(view.openOrder).toBe(3);
    expect(view.title).toBe('Buy milk');
  });

  it('keeps the current list when the event does not mention listId', () => {
    const onGroceries: Task = { ...current, listId: 'list-groceries' };

    const view = applyTaskEvent(onGroceries, {
      type: 'TaskUpdated',
      id: current.id,
      organizationId: current.organizationId,
      title: 'Buy oat milk',
    });

    expect(view.listId).toBe('list-groceries');
    expect(view.title).toBe('Buy oat milk');
  });

  it('marks complete without clearing listId or openOrder', () => {
    const onList: Task = { ...current, listId: 'list-groceries', openOrder: 1 };

    const view = applyTaskEvent(onList, {
      type: 'TaskCompleted',
      id: current.id,
      completedAt: '2025-01-16T10:00:00.000Z',
    });

    expect(view.completedAt).toBe('2025-01-16T10:00:00.000Z');
    expect(view.listId).toBe('list-groceries');
    expect(view.openOrder).toBe(1);
  });

  it('restores an uncompleted task at the clamped open order', () => {
    const done: Task = {
      ...current,
      listId: 'list-groceries',
      openOrder: 4,
      completedAt: '2025-01-16T10:00:00.000Z',
    };

    const view = applyTaskEvent(done, {
      type: 'TaskUncompleted',
      id: current.id,
      openOrder: 1,
      siblingOrders: [{ id: 'task-a', openOrder: 0 }],
    });

    expect(view.completedAt).toBeUndefined();
    expect(view.listId).toBe('list-groceries');
    expect(view.openOrder).toBe(1);
  });
});
