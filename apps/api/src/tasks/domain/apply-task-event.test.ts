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
  it('projects a list onto an unlisted task', () => {
    const view = applyTaskEvent(current, {
      type: 'TaskUpdated',
      id: current.id,
      organizationId: current.organizationId,
      listId: 'list-groceries',
    });

    expect(view.listId).toBe('list-groceries');
    expect(view.title).toBe('Buy milk');
  });

  it('moves the task onto another list', () => {
    const onGroceries: Task = { ...current, listId: 'list-groceries' };

    const view = applyTaskEvent(onGroceries, {
      type: 'TaskUpdated',
      id: current.id,
      organizationId: current.organizationId,
      listId: 'list-weekend',
    });

    expect(view.listId).toBe('list-weekend');
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
});
