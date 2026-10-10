import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import { decideDeleteTask } from './decide-delete.js';

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

describe('decideDeleteTask', () => {
  it('records a delete for the task only', () => {
    const result = decideDeleteTask({
      current,
      command: { id: current.id, organizationId: current.organizationId, actor: { kind: 'user' as const, userId: 'user-1', via: 'session' } },
      now: '2025-01-15T12:00:00.000Z',
    });
    expect(result._unsafeUnwrap()).toEqual({
      type: 'TaskDeleted',
      id: current.id,
      organizationId: current.organizationId,
      deletedAt: '2025-01-15T12:00:00.000Z',
      occurredAt: '2025-01-15T12:00:00.000Z',
    });
  });

  it('includes the source capture id so persist can cascade without logging it', () => {
    const result = decideDeleteTask({
      current: { ...current, captureId: 'cap-1' },
      command: { id: current.id, organizationId: current.organizationId, actor: { kind: 'user' as const, userId: 'user-1', via: 'session' } },
      now: '2025-01-15T12:00:00.000Z',
    });
    expect(result._unsafeUnwrap().captureId).toBe('cap-1');
  });
});
