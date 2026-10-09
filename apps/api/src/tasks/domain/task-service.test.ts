import { describe, it, expect } from 'vitest';
import { createTaskService } from './task-service.js';
import { createFakeTaskStore } from '../infrastructure/fake-task-store.js';
import type { Task } from '@yoink/api-contracts';

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

describe('createTaskService', () => {
  describe('find', () => {
    it('returns task when it exists in organization', async () => {
      const existingTask = task({ id: 'task-123', title: 'Existing task' });
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const service = createTaskService({ store });

      const result = await service.find({
        id: 'task-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(existingTask);
      }
    });

    it('returns not found error when task does not exist', async () => {
      const store = createFakeTaskStore();
      const service = createTaskService({ store });

      const result = await service.find({
        id: 'non-existent',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('TASK_NOT_FOUND');
      }
    });

    it('returns not found error when task belongs to different organization', async () => {
      const store = createFakeTaskStore({
        initialTasks: [
          task({ id: 'task-123', title: 'Other org task', organizationId: 'other-org' }),
        ],
      });
      const service = createTaskService({ store });

      const result = await service.find({
        id: 'task-123',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('TASK_NOT_FOUND');
      }
    });
  });
});
