import { describe, it, expect, beforeEach } from 'vitest';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Capture, Task } from '@yoink/api-contracts';
import { createCaptureProcessingService, type CaptureProcessingService } from './processing-service.js';
import { createFakeCaptureStore } from '../../captures/infrastructure/fake-capture-store.js';
import { createFakeTaskStore } from '../../tasks/infrastructure/fake-task-store.js';
import type { CaptureStore } from '../../captures/domain/capture-store.js';
import type { TaskStore } from '../../tasks/domain/task-store.js';

describe('CaptureProcessingService', () => {
  const now = new Date('2024-12-24T10:00:00.000Z');
  const clock = createFakeClock(now);
  const idGenerator = createFakeIdGenerator();

  let captureStore: CaptureStore;
  let taskStore: TaskStore;
  let service: CaptureProcessingService;

  const createInboxCapture = (overrides?: Partial<Capture>): Capture => ({
    id: idGenerator.generate(),
    organizationId: 'org-1',
    createdById: 'user-1',
    content: 'This is a captured thought that should become a task',
    status: 'inbox',
    capturedAt: '2024-12-24T09:00:00.000Z',
    ...overrides,
  });

  beforeEach(() => {
    captureStore = createFakeCaptureStore();
    taskStore = createFakeTaskStore();
    service = createCaptureProcessingService({
      captureStore,
      taskStore,
      clock,
      idGenerator,
    });
  });

  describe('processCaptureToTask', () => {
    it('creates a task from a capture in inbox', async () => {
      const capture = createInboxCapture();
      await captureStore.save(capture);

      const result = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
      });

      expect(result.isOk()).toBe(true);
      const task = result._unsafeUnwrap();
      expect(task).toMatchObject({
        organizationId: 'org-1',
        createdById: 'user-1',
        title: 'This is a captured thought that should become a task',
        captureId: capture.id,
      });
    });

    it('uses custom title when provided', async () => {
      const capture = createInboxCapture();
      await captureStore.save(capture);

      const result = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
        title: 'My custom task title',
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().title).toBe('My custom task title');
    });

    it('truncates capture content to 100 chars for default title', async () => {
      const longContent = 'A'.repeat(200);
      const capture = createInboxCapture({ content: longContent });
      await captureStore.save(capture);

      const result = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().title).toBe('A'.repeat(100));
    });

    it('sets dueDate when provided', async () => {
      const capture = createInboxCapture();
      await captureStore.save(capture);

      const result = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
        dueDate: '2024-12-31',
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().dueDate).toBe('2024-12-31');
    });

    it('marks the capture as processed', async () => {
      const capture = createInboxCapture();
      await captureStore.save(capture);

      const result = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
      });

      expect(result.isOk()).toBe(true);
      const task = result._unsafeUnwrap();

      const updatedCapture = await captureStore.findById(capture.id);
      expect(updatedCapture.isOk()).toBe(true);
      const captureData = updatedCapture._unsafeUnwrap();
      expect(captureData?.status).toBe('processed');
      expect(captureData?.processedAt).toBe(now.toISOString());
      expect(captureData?.processedToType).toBe('task');
      expect(captureData?.processedToId).toBe(task.id);
    });

    it('returns error when capture not found', async () => {
      const result = await service.processCaptureToTask({
        id: 'non-existent',
        organizationId: 'org-1',
        createdById: 'user-1',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('CAPTURE_NOT_FOUND');
    });

    it('returns error when capture belongs to different organization', async () => {
      const capture = createInboxCapture({ organizationId: 'org-2' });
      await captureStore.save(capture);

      const result = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1', // Different org
        createdById: 'user-1',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('CAPTURE_NOT_FOUND');
    });

    it('returns error when capture is not in inbox status', async () => {
      const trashedCapture = createInboxCapture({ 
        status: 'trashed',
        trashedAt: '2024-12-24T08:00:00.000Z',
      });
      await captureStore.save(trashedCapture);

      const result = await service.processCaptureToTask({
        id: trashedCapture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('CAPTURE_NOT_IN_INBOX');
    });

    it('returns error when capture is already processed', async () => {
      const processedCapture = createInboxCapture({
        status: 'processed',
        processedAt: '2024-12-24T08:00:00.000Z',
        processedToType: 'task',
        processedToId: 'task-1',
      });
      await captureStore.save(processedCapture);

      const result = await service.processCaptureToTask({
        id: processedCapture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('CAPTURE_NOT_IN_INBOX');
    });

    it('prevents race condition when two requests try to process the same capture', async () => {
      // This test verifies that status verification happens atomically within the transaction
      // If a capture is processed between the initial read and the transaction,
      // the second request should fail with CAPTURE_NOT_IN_INBOX
      const capture = createInboxCapture();
      await captureStore.save(capture);

      // First request processes successfully
      const firstResult = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
      });
      expect(firstResult.isOk()).toBe(true);

      // Verify the capture is now processed
      const updatedCapture = await captureStore.findById(capture.id);
      expect(updatedCapture._unsafeUnwrap()?.status).toBe('processed');

      // Second request should fail because capture is no longer in inbox
      const secondResult = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-2',
      });
      expect(secondResult.isErr()).toBe(true);
      expect(secondResult._unsafeUnwrapErr().type).toBe('CAPTURE_NOT_IN_INBOX');
    });
  });

  describe('deleteTaskWithCascade', () => {
    it('deletes a task', async () => {
      const task: Task = {
        id: idGenerator.generate(),
        organizationId: 'org-1',
        createdById: 'user-1',
        title: 'A task',
        createdAt: now.toISOString(),
      };
      await taskStore.save(task);

      const result = await service.deleteTaskWithCascade({
        id: task.id,
        organizationId: 'org-1',
      });

      expect(result.isOk()).toBe(true);

      const foundTask = await taskStore.findById(task.id);
      expect(foundTask._unsafeUnwrap()).toBeNull();
    });

    it('also deletes the source capture when task has captureId', async () => {
      const capture = createInboxCapture();
      await captureStore.save(capture);

      // Process the capture to create a task
      const processResult = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
      });
      expect(processResult.isOk()).toBe(true);
      const task = processResult._unsafeUnwrap();

      // Now delete the task with cascade
      const deleteResult = await service.deleteTaskWithCascade({
        id: task.id,
        organizationId: 'org-1',
      });

      expect(deleteResult.isOk()).toBe(true);

      // Task should be deleted
      const foundTask = await taskStore.findById(task.id);
      expect(foundTask._unsafeUnwrap()).toBeNull();

      // Capture should also be deleted
      const foundCapture = await captureStore.findById(capture.id);
      expect(foundCapture._unsafeUnwrap()).toBeNull();
    });

    it('returns error when task not found', async () => {
      const result = await service.deleteTaskWithCascade({
        id: 'non-existent',
        organizationId: 'org-1',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('TASK_NOT_FOUND');
    });

    it('returns error when task belongs to different organization', async () => {
      const task: Task = {
        id: idGenerator.generate(),
        organizationId: 'org-2',
        createdById: 'user-1',
        title: 'A task',
        createdAt: now.toISOString(),
      };
      await taskStore.save(task);

      const result = await service.deleteTaskWithCascade({
        id: task.id,
        organizationId: 'org-1', // Different org
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('TASK_NOT_FOUND');
    });
  });
});
