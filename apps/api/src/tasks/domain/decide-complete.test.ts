import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import { decideCompleteTask } from './decide-complete.js';

const current: Task = {
  id: 'task-123',
  organizationId: 'org-123',
  createdById: 'user-456',
  title: 'Buy milk',
  createdAt: '2025-01-15T10:00:00.000Z',
  listId: 'list-groceries',
  openOrder: 1,
};

describe('decideCompleteTask', () => {
  it('marks an open task complete and keeps the remembered open-order index', () => {
    const result = decideCompleteTask({
      current,
      command: { id: current.id, organizationId: current.organizationId },
      now: '2025-01-16T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'TaskCompleted',
        id: 'task-123',
        completedAt: '2025-01-16T10:00:00.000Z',
      });
    }
  });

  it('is a noop when the task is already completed', () => {
    const result = decideCompleteTask({
      current: { ...current, completedAt: '2025-01-16T09:00:00.000Z' },
      command: { id: current.id, organizationId: current.organizationId },
      now: '2025-01-16T10:00:00.000Z',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ type: 'Noop' });
    }
  });
});
