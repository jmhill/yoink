import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import { applyTaskCreated, applyTaskMutation } from './apply-task-event.js';

const meta = { actorUserId: null };

const current: Task = {
  id: 'task-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  title: 'Buy milk',
  createdAt: '2025-01-15T10:00:00.000Z',
  lastChangedAt: null,
  lastChangedBy: null,
  completedBy: null,
};

describe('applyTaskCreated / applyTaskMutation', () => {
  it('projects a newly created task already on a list', () => {
    const view = applyTaskCreated(
      {
        type: 'TaskCreated',
        id: 'task-new',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Buy milk',
        listId: 'list-groceries',
        openOrder: 0,
        createdAt: '2025-01-15T10:00:00.000Z',
        occurredAt: '2025-01-15T10:00:00.000Z',
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
    const view = applyTaskCreated(
      {
        type: 'TaskCreated',
        id: 'task-new',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Loose end',
        openOrder: 0,
        createdAt: '2025-01-15T10:00:00.000Z',
        occurredAt: '2025-01-15T10:00:00.000Z',
      },
      meta
    );

    expect(view.listId).toBeUndefined();
    expect(view.title).toBe('Loose end');
  });

  it('projects a list onto an unlisted task', () => {
    const view = applyTaskMutation(
      current,
      {
        type: 'TaskUpdated',
        id: current.id,
        organizationId: current.organizationId,
        listId: 'list-groceries',
        openOrder: 2,
        occurredAt: '2025-01-15T11:00:00.000Z',
      },
      meta
    );

    expect(view.listId).toBe('list-groceries');
    expect(view.openOrder).toBe(2);
    expect(view.title).toBe('Buy milk');
    expect(view.lastChangedAt).toBe('2025-01-15T11:00:00.000Z');
  });

  it('sets and clears projectId without touching listId', () => {
    const onList: Task = { ...current, listId: 'list-groceries', openOrder: 1 };
    const added = applyTaskMutation(
      onList,
      {
        type: 'TaskUpdated',
        id: current.id,
        organizationId: current.organizationId,
        projectId: 'project-garden',
        occurredAt: '2025-01-15T11:00:00.000Z',
      },
      meta
    );
    expect(added.projectId).toBe('project-garden');
    expect(added.listId).toBe('list-groceries');
    expect(added.openOrder).toBe(1);

    const cleared = applyTaskMutation(
      added,
      {
        type: 'TaskUpdated',
        id: current.id,
        organizationId: current.organizationId,
        projectId: null,
        occurredAt: '2025-01-15T12:00:00.000Z',
      },
      meta
    );
    expect(cleared.projectId).toBeUndefined();
    expect(cleared.listId).toBe('list-groceries');
  });

  it('moves the task onto another list', () => {
    const onGroceries: Task = { ...current, listId: 'list-groceries' };

    const view = applyTaskMutation(
      onGroceries,
      {
        type: 'TaskUpdated',
        id: current.id,
        organizationId: current.organizationId,
        listId: 'list-weekend',
        openOrder: 0,
        occurredAt: '2025-01-15T10:00:00.000Z',
      },
      meta
    );

    expect(view.listId).toBe('list-weekend');
    expect(view.openOrder).toBe(0);
  });

  it('clears the list when the event takes the task off', () => {
    const onGroceries: Task = { ...current, listId: 'list-groceries' };

    const view = applyTaskMutation(
      onGroceries,
      {
        type: 'TaskUpdated',
        id: current.id,
        organizationId: current.organizationId,
        listId: null,
        openOrder: 3,
        occurredAt: '2025-01-15T10:00:00.000Z',
      },
      meta
    );

    expect(view.listId).toBeUndefined();
    expect(view.openOrder).toBe(3);
    expect(view.title).toBe('Buy milk');
  });

  it('keeps the current list when the event does not mention listId', () => {
    const onGroceries: Task = { ...current, listId: 'list-groceries' };

    const view = applyTaskMutation(
      onGroceries,
      {
        type: 'TaskUpdated',
        id: current.id,
        organizationId: current.organizationId,
        title: 'Buy oat milk',
        occurredAt: '2025-01-15T10:00:00.000Z',
      },
      meta
    );

    expect(view.listId).toBe('list-groceries');
    expect(view.title).toBe('Buy oat milk');
  });

  it('marks complete without clearing listId or openOrder', () => {
    const onList: Task = { ...current, listId: 'list-groceries', openOrder: 1 };

    const view = applyTaskMutation(
      onList,
      {
        type: 'TaskCompleted',
        id: current.id,
        organizationId: current.organizationId,
        completedAt: '2025-01-16T10:00:00.000Z',
        occurredAt: '2025-01-16T10:00:00.000Z',
      },
      meta
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

    const view = applyTaskMutation(
      done,
      {
        type: 'TaskUncompleted',
        id: current.id,
        organizationId: current.organizationId,
        openOrder: 1,
        siblingOrders: [{ id: 'task-a', openOrder: 0 }],
        occurredAt: '2025-01-16T11:00:00.000Z',
      },
      meta
    );

    expect(view.completedAt).toBeUndefined();
    expect(view.completedBy).toBeNull();
    expect(view.listId).toBe('list-groceries');
    expect(view.openOrder).toBe(1);
    expect(view.lastChangedAt).toBe('2025-01-16T11:00:00.000Z');
  });

  it('does not count pin toward last changed', () => {
    const view = applyTaskMutation(
      current,
      {
        type: 'TaskPinned',
        id: current.id,
        organizationId: current.organizationId,
        pinnedAt: '2025-01-15T11:00:00.000Z',
        occurredAt: '2025-01-15T11:00:00.000Z',
      },
      meta
    );

    expect(view.pinnedAt).toBe('2025-01-15T11:00:00.000Z');
    expect(view.lastChangedAt).toBeNull();
  });
});
