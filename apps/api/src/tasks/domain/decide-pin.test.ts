import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import { decidePinTask } from './decide-pin.js';
import { decideUnpinTask } from './decide-unpin.js';

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

describe('decidePinTask', () => {
  it('pins an unpinned task', () => {
    const result = decidePinTask({
      current,
      command: { id: current.id, organizationId: current.organizationId, actor: { kind: 'user' as const, userId: 'user-1', via: 'session' } },
      now: '2025-01-15T11:00:00.000Z',
    });
    expect(result._unsafeUnwrap()).toEqual({
      type: 'TaskPinned',
      id: current.id,
      organizationId: current.organizationId,
      pinnedAt: '2025-01-15T11:00:00.000Z',
      occurredAt: '2025-01-15T11:00:00.000Z',
    });
  });

  it('is a noop when already pinned', () => {
    const result = decidePinTask({
      current: { ...current, pinnedAt: '2025-01-15T10:30:00.000Z' },
      command: { id: current.id, organizationId: current.organizationId, actor: { kind: 'user' as const, userId: 'user-1', via: 'session' } },
      now: '2025-01-15T11:00:00.000Z',
    });
    expect(result._unsafeUnwrap()).toEqual({ type: 'Noop' });
  });
});

describe('decideUnpinTask', () => {
  it('unpins a pinned task', () => {
    const result = decideUnpinTask({
      current: { ...current, pinnedAt: '2025-01-15T10:30:00.000Z' },
      command: { id: current.id, organizationId: current.organizationId, actor: { kind: 'user' as const, userId: 'user-1', via: 'session' } },
      now: '2025-01-15T11:00:00.000Z',
    });
    expect(result._unsafeUnwrap()).toEqual({
      type: 'TaskUnpinned',
      id: current.id,
      organizationId: current.organizationId,
      occurredAt: '2025-01-15T11:00:00.000Z',
    });
  });

  it('is a noop when not pinned', () => {
    const result = decideUnpinTask({
      current,
      command: { id: current.id, organizationId: current.organizationId, actor: { kind: 'user' as const, userId: 'user-1', via: 'session' } },
      now: '2025-01-15T11:00:00.000Z',
    });
    expect(result._unsafeUnwrap()).toEqual({ type: 'Noop' });
  });
});
