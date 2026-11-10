import { describe, it, expect } from 'vitest';
import type { Task } from '@yoink/api-contracts';
import { createFakeTaskStore } from '../../infrastructure/fakes/fake-task-store.js';
import { handleGetTask } from './handle-get-task.js';

const lastChanged = {
  lastChangedAt: null,
  lastChangedBy: null,
  completedBy: null,
} as const;

const task = (overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  organizationId: 'org-123',
  createdById: 'user-456',
  createdAt: '2025-01-15T10:00:00.000Z',
  ...overrides,
  lastChangedAt: overrides.lastChangedAt ?? lastChanged.lastChangedAt,
  lastChangedBy: overrides.lastChangedBy ?? lastChanged.lastChangedBy,
  completedBy: overrides.completedBy ?? lastChanged.completedBy,
});

describe('handleGetTask', () => {
  it('returns the task when it exists in the organization', async () => {
    const existingTask = task({ id: 'task-123', title: 'Existing task' });
    const store = createFakeTaskStore({ initialTasks: [existingTask] });

    const result = await handleGetTask(
      { id: 'task-123', organizationId: 'org-123' },
      { load: store.findById }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(existingTask);
    }
  });

  it('returns not found when the task does not exist', async () => {
    const store = createFakeTaskStore();

    const result = await handleGetTask(
      { id: 'non-existent', organizationId: 'org-123' },
      { load: store.findById }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TASK_NOT_FOUND');
    }
  });

  it('returns not found when the task belongs to a different organization', async () => {
    const store = createFakeTaskStore({
      initialTasks: [task({ id: 'task-123', title: 'Other org task', organizationId: 'other-org' })],
    });

    const result = await handleGetTask(
      { id: 'task-123', organizationId: 'org-123' },
      { load: store.findById }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TASK_NOT_FOUND');
    }
  });
});
