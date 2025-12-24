import { describe, it, expect } from 'vitest';
import { createTaskService } from './task-service.js';
import { createFakeTaskStore } from '../infrastructure/fake-task-store.js';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';

describe('createTaskService', () => {
  describe('create', () => {
    it('creates a task with generated id and timestamp', async () => {
      const store = createFakeTaskStore();
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator(['task-id-1']);
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.create({
        title: 'Buy groceries',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          id: 'task-id-1',
          organizationId: 'org-123',
          createdById: 'user-456',
          title: 'Buy groceries',
          createdAt: '2025-01-15T10:00:00.000Z',
        });
      }
    });

    it('persists task to store', async () => {
      const store = createFakeTaskStore();
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      await service.create({
        title: 'Buy groceries',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      const listResult = await service.list({ organizationId: 'org-123' });
      expect(listResult.isOk()).toBe(true);
      if (listResult.isOk()) {
        expect(listResult.value.tasks).toHaveLength(1);
        expect(listResult.value.tasks[0].title).toBe('Buy groceries');
      }
    });

    it('includes optional fields when provided', async () => {
      const store = createFakeTaskStore();
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.create({
        title: 'Buy groceries',
        dueDate: '2025-01-20',
        organizationId: 'org-123',
        createdById: 'user-456',
        captureId: 'capture-789',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.dueDate).toBe('2025-01-20');
        expect(result.value.captureId).toBe('capture-789');
      }
    });

    it('returns error when store fails', async () => {
      const store = createFakeTaskStore({ shouldFailOnSave: true });
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.create({
        title: 'Buy groceries',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('STORAGE_ERROR');
      }
    });
  });

  describe('list', () => {
    it('returns tasks from store', async () => {
      const store = createFakeTaskStore();
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator(['task-id-1']);
      const service = createTaskService({ store, clock, idGenerator });

      await service.create({
        title: 'Test task',
        organizationId: 'org-123',
        createdById: 'user-456',
      });

      const result = await service.list({ organizationId: 'org-123' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.tasks).toHaveLength(1);
        expect(result.value.tasks[0].title).toBe('Test task');
      }
    });

    it('filters by today', async () => {
      const todayTask = {
        id: 'today-task',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Today task',
        dueDate: '2025-01-15',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const tomorrowTask = {
        id: 'tomorrow-task',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Tomorrow task',
        dueDate: '2025-01-16',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [todayTask, tomorrowTask] });
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.list({
        organizationId: 'org-123',
        filter: 'today',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.tasks).toHaveLength(1);
        expect(result.value.tasks[0].title).toBe('Today task');
      }
    });

    it('filters by upcoming', async () => {
      const todayTask = {
        id: 'today-task',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Today task',
        dueDate: '2025-01-15',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const tomorrowTask = {
        id: 'tomorrow-task',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Tomorrow task',
        dueDate: '2025-01-16',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [todayTask, tomorrowTask] });
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.list({
        organizationId: 'org-123',
        filter: 'upcoming',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.tasks).toHaveLength(1);
        expect(result.value.tasks[0].title).toBe('Tomorrow task');
      }
    });

    it('filters by completed', async () => {
      const incompleteTask = {
        id: 'incomplete-task',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Incomplete task',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const completedTask = {
        id: 'completed-task',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Completed task',
        completedAt: '2025-01-15T11:00:00.000Z',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [incompleteTask, completedTask] });
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.list({
        organizationId: 'org-123',
        filter: 'completed',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.tasks).toHaveLength(1);
        expect(result.value.tasks[0].title).toBe('Completed task');
      }
    });

    it('returns error when store fails', async () => {
      const store = createFakeTaskStore({ shouldFailOnFind: true });
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.list({ organizationId: 'org-123' });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('STORAGE_ERROR');
      }
    });
  });

  describe('find', () => {
    it('returns task when it exists in organization', async () => {
      const existingTask = {
        id: 'task-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Existing task',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

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
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

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
      const existingTask = {
        id: 'task-123',
        organizationId: 'other-org',
        createdById: 'user-456',
        title: 'Other org task',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

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

  describe('update', () => {
    it('updates task title', async () => {
      const existingTask = {
        id: 'task-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Original title',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.update({
        id: 'task-123',
        organizationId: 'org-123',
        title: 'Updated title',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.title).toBe('Updated title');
      }
    });

    it('updates task dueDate', async () => {
      const existingTask = {
        id: 'task-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Task',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.update({
        id: 'task-123',
        organizationId: 'org-123',
        dueDate: '2025-01-20',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.dueDate).toBe('2025-01-20');
      }
    });

    it('clears dueDate when set to null', async () => {
      const existingTask = {
        id: 'task-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Task',
        dueDate: '2025-01-20',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.update({
        id: 'task-123',
        organizationId: 'org-123',
        dueDate: null,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.dueDate).toBeUndefined();
      }
    });

    it('returns not found error when task does not exist', async () => {
      const store = createFakeTaskStore();
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.update({
        id: 'non-existent',
        organizationId: 'org-123',
        title: 'Updated',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('TASK_NOT_FOUND');
      }
    });
  });

  describe('complete', () => {
    it('completes a task and sets completedAt', async () => {
      const existingTask = {
        id: 'task-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Task',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.complete({
        id: 'task-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.completedAt).toBe('2025-01-16T10:00:00.000Z');
      }
    });

    it('is idempotent - completing already completed task succeeds', async () => {
      const existingTask = {
        id: 'task-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Task',
        completedAt: '2025-01-15T12:00:00.000Z',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.complete({
        id: 'task-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // Original completedAt is preserved
        expect(result.value.completedAt).toBe('2025-01-15T12:00:00.000Z');
      }
    });

    it('returns not found error when task does not exist', async () => {
      const store = createFakeTaskStore();
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.complete({
        id: 'non-existent',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('TASK_NOT_FOUND');
      }
    });
  });

  describe('uncomplete', () => {
    it('uncompletes a task and clears completedAt', async () => {
      const existingTask = {
        id: 'task-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Task',
        completedAt: '2025-01-15T12:00:00.000Z',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.uncomplete({
        id: 'task-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.completedAt).toBeUndefined();
      }
    });

    it('is idempotent - uncompleting incomplete task succeeds', async () => {
      const existingTask = {
        id: 'task-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Task',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.uncomplete({
        id: 'task-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.completedAt).toBeUndefined();
      }
    });
  });

  describe('pin', () => {
    it('pins a task and sets pinnedAt', async () => {
      const existingTask = {
        id: 'task-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Task',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.pin({
        id: 'task-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.pinnedAt).toBe('2025-01-16T10:00:00.000Z');
      }
    });

    it('is idempotent - pinning already pinned task succeeds', async () => {
      const existingTask = {
        id: 'task-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Task',
        pinnedAt: '2025-01-15T12:00:00.000Z',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.pin({
        id: 'task-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // Original pinnedAt is preserved
        expect(result.value.pinnedAt).toBe('2025-01-15T12:00:00.000Z');
      }
    });
  });

  describe('unpin', () => {
    it('unpins a task and clears pinnedAt', async () => {
      const existingTask = {
        id: 'task-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Task',
        pinnedAt: '2025-01-15T12:00:00.000Z',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.unpin({
        id: 'task-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.pinnedAt).toBeUndefined();
      }
    });

    it('is idempotent - unpinning unpinned task succeeds', async () => {
      const existingTask = {
        id: 'task-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Task',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.unpin({
        id: 'task-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.pinnedAt).toBeUndefined();
      }
    });
  });

  describe('delete', () => {
    it('deletes a task', async () => {
      const existingTask = {
        id: 'task-123',
        organizationId: 'org-123',
        createdById: 'user-456',
        title: 'Task',
        createdAt: '2025-01-15T10:00:00.000Z',
      };
      const store = createFakeTaskStore({ initialTasks: [existingTask] });
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.delete({
        id: 'task-123',
        organizationId: 'org-123',
      });

      expect(result.isOk()).toBe(true);

      // Verify task is no longer findable
      const findResult = await service.find({
        id: 'task-123',
        organizationId: 'org-123',
      });
      expect(findResult.isErr()).toBe(true);
      if (findResult.isErr()) {
        expect(findResult.error.type).toBe('TASK_NOT_FOUND');
      }
    });

    it('returns not found error when task does not exist', async () => {
      const store = createFakeTaskStore();
      const clock = createFakeClock(new Date('2025-01-16T10:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const service = createTaskService({ store, clock, idGenerator });

      const result = await service.delete({
        id: 'non-existent',
        organizationId: 'org-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('TASK_NOT_FOUND');
      }
    });
  });
});
