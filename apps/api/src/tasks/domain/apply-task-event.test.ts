import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import { applyTaskEvent } from './apply-task-event.js';

const meta = { now: '2025-01-15T10:00:00.000Z', actorUserId: null };

const current: Task = {
  id: 'task-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  title: 'Buy milk',
  createdAt: '2025-01-15T10:00:00.000Z',
};

describe('applyTaskEvent', () => {
  it('projects a newly created task already on a list', () => {
    const view = applyTaskEvent(
      null,
      {
        type: 'TaskCreated',
        id: 'task-new',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Buy milk',
        listId: 'list-groceries',
        openOrder: 0,
        createdAt: '2025-01-15T10:00:00.000Z',
      },
      meta
    );

    expect(view).toEqual({
      id: 'task-new',
      organizationId: 'org-123',
      createdById: 'user-456',
      title: 'Buy milk',
      listId: 'list-groceries',
      openOrder: 0,
      createdAt: '2025-01-15T10:00:00.000Z',
      lastChangedAt: '2025-01-15T10:00:00.000Z',
      lastChangedBy: null,
      completedBy: null,
    });
    expect(view.completedAt).toBeUndefined();
  });

  it('projects a newly created unlisted task', () => {
    const view = applyTaskEvent(
      null,
      {
        type: 'TaskCreated',
        id: 'task-new',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Loose end',
        openOrder: 0,
        createdAt: '2025-01-15T10:00:00.000Z',
      },
      meta
    );

    expect(view.listId).toBeUndefined();
    expect(view.title).toBe('Loose end');
  });

  it('projects a list onto an unlisted task', () => {
    const view = applyTaskEvent(
      current,
      {
        type: 'TaskUpdated',
        id: current.id,
        organizationId: current.organizationId,
        listId: 'list-groceries',
        openOrder: 2,
      },
      { now: '2025-01-15T11:00:00.000Z', actorUserId: null }
    );

    expect(view.listId).toBe('list-groceries');
    expect(view.openOrder).toBe(2);
    expect(view.title).toBe('Buy milk');
    expect(view.lastChangedAt).toBe('2025-01-15T11:00:00.000Z');
  });

  it('moves the task onto another list', () => {
    const onGroceries: Task = { ...current, listId: 'list-groceries' };

    const view = applyTaskEvent(
      onGroceries,
      {
        type: 'TaskUpdated',
        id: current.id,
        organizationId: current.organizationId,
        listId: 'list-weekend',
        openOrder: 0,
      },
      meta
    );

    expect(view.listId).toBe('list-weekend');
    expect(view.openOrder).toBe(0);
  });

  it('clears the list when the event takes the task off', () => {
    const onGroceries: Task = { ...current, listId: 'list-groceries' };

    const view = applyTaskEvent(
      onGroceries,
      {
        type: 'TaskUpdated',
        id: current.id,
        organizationId: current.organizationId,
        listId: null,
        openOrder: 3,
      },
      meta
    );

    expect(view.listId).toBeUndefined();
    expect(view.openOrder).toBe(3);
    expect(view.title).toBe('Buy milk');
  });

  it('keeps the current list when the event does not mention listId', () => {
    const onGroceries: Task = { ...current, listId: 'list-groceries' };

    const view = applyTaskEvent(
      onGroceries,
      {
        type: 'TaskUpdated',
        id: current.id,
        organizationId: current.organizationId,
        title: 'Buy oat milk',
      },
      meta
    );

    expect(view.listId).toBe('list-groceries');
    expect(view.title).toBe('Buy oat milk');
  });

  it('marks complete without clearing listId or openOrder', () => {
    const onList: Task = { ...current, listId: 'list-groceries', openOrder: 1 };

    const view = applyTaskEvent(
      onList,
      {
        type: 'TaskCompleted',
        id: current.id,
        organizationId: current.organizationId,
        completedAt: '2025-01-16T10:00:00.000Z',
      },
      { now: '2025-01-16T10:00:00.000Z', actorUserId: null }
    );

    expect(view.completedAt).toBe('2025-01-16T10:00:00.000Z');
    expect(view.completedBy).toBeNull();
    expect(view.listId).toBe('list-groceries');
    expect(view.openOrder).toBe(1);
    expect(view.lastChangedAt).toBe('2025-01-16T10:00:00.000Z');
  });

  it('restores an uncompleted task at the clamped open order', () => {
    const done: Task = {
      ...current,
      listId: 'list-groceries',
      openOrder: 4,
      completedAt: '2025-01-16T10:00:00.000Z',
      completedBy: null,
    };

    const view = applyTaskEvent(
      done,
      {
        type: 'TaskUncompleted',
        id: current.id,
        organizationId: current.organizationId,
        openOrder: 1,
        siblingOrders: [{ id: 'task-a', openOrder: 0 }],
      },
      { now: '2025-01-16T11:00:00.000Z', actorUserId: null }
    );

    expect(view.completedAt).toBeUndefined();
    expect(view.completedBy).toBeNull();
    expect(view.listId).toBe('list-groceries');
    expect(view.openOrder).toBe(1);
    expect(view.lastChangedAt).toBe('2025-01-16T11:00:00.000Z');
  });

  it('does not count pin toward last changed', () => {
    const view = applyTaskEvent(
      { ...current, lastChangedAt: null, lastChangedBy: null },
      {
        type: 'TaskPinned',
        id: current.id,
        organizationId: current.organizationId,
        pinnedAt: '2025-01-15T11:00:00.000Z',
      },
      { now: '2025-01-15T11:00:00.000Z', actorUserId: null }
    );

    expect(view.pinnedAt).toBe('2025-01-15T11:00:00.000Z');
    expect(view.lastChangedAt).toBeNull();
  });
});
