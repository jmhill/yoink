import { describe, it, expect, beforeEach } from 'vitest';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Capture, NamedList, Task } from '@yoink/api-contracts';
import { createCaptureProcessingService, type CaptureProcessingService } from './processing-service.js';
import { createFakeCaptureStore } from '../../captures/infrastructure/fake-capture-store.js';
import { createFakeTaskStore } from '../../tasks/infrastructure/fake-task-store.js';
import { createFakeListStore } from '../../lists/infrastructure/fake-list-store.js';
import { createStoreBackedPersist } from '../../tasks/infrastructure/store-backed-persist.js';
import { handleCreateTask } from '../../tasks/application/handle-create-task.js';
import type { CaptureStore } from '../../captures/domain/capture-store.js';
import type { TaskStore } from '../../tasks/domain/task-store.js';
import type { ListStore } from '../../lists/domain/list-store.js';

describe('CaptureProcessingService', () => {
  const now = new Date('2024-12-24T10:00:00.000Z');
  const clock = createFakeClock(now);
  const idGenerator = createFakeIdGenerator();

  let captureStore: CaptureStore;
  let taskStore: TaskStore;
  let listStore: ListStore;
  let service: CaptureProcessingService;

  const groceries: NamedList = {
    id: 'list-groceries',
    organizationId: 'org-1',
    createdById: 'user-1',
    name: 'Groceries',
    createdAt: '2024-12-24T08:00:00.000Z',
  };

  const otherOrgList: NamedList = {
    id: 'list-other',
    organizationId: 'org-2',
    createdById: 'user-other',
    name: 'Other',
    createdAt: '2024-12-24T08:00:00.000Z',
  };

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
    listStore = createFakeListStore({ initialLists: [groceries, otherOrgList] });
    const persist = createStoreBackedPersist(taskStore);
    service = createCaptureProcessingService({
      captureStore,
      taskStore,
      createTask: (command) =>
        handleCreateTask(command, {
          loadList: (id) => listStore.findById(id),
          loadNextOpenOrder: (organizationId, listId) =>
            taskStore.nextOpenOrderInPile({ organizationId, listId }),
          persist,
          nextId: () => idGenerator.generate(),
          now: () => clock.now().toISOString(),
        }).map((result) => result.view),
      clock,
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
      expect(task.listId).toBeUndefined();
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

    it('puts the new task on a named list and joins that pile open order', async () => {
      const capture = createInboxCapture();
      await captureStore.save(capture);

      const result = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
        listId: groceries.id,
      });

      expect(result.isOk()).toBe(true);
      const task = result._unsafeUnwrap();
      expect(task.listId).toBe(groceries.id);
      expect(task.openOrder).toBe(0);

      const onList = await taskStore.findOpenInPile({
        organizationId: 'org-1',
        listId: groceries.id,
      });
      expect(onList.isOk()).toBe(true);
      expect(onList._unsafeUnwrap().map((item) => item.id)).toEqual([task.id]);
    });

    it('appends to the end of that list open pile', async () => {
      const existing: Task = {
        id: 'already-on-list',
        organizationId: 'org-1',
        createdById: 'user-1',
        title: 'Eggs',
        listId: groceries.id,
        openOrder: 0,
        createdAt: '2024-12-24T08:30:00.000Z',
      };
      await taskStore.save(existing);

      const capture = createInboxCapture();
      await captureStore.save(capture);

      const result = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
        listId: groceries.id,
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().openOrder).toBe(1);
    });

    it('creates an unlisted task when listId is omitted', async () => {
      const capture = createInboxCapture();
      await captureStore.save(capture);

      const result = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
      });

      expect(result.isOk()).toBe(true);
      const task = result._unsafeUnwrap();
      expect(task.listId).toBeUndefined();
      expect(task.openOrder).toBe(0);
    });

    it('rejects an unknown list and leaves the capture in inbox', async () => {
      const capture = createInboxCapture();
      await captureStore.save(capture);

      const result = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
        listId: 'list-missing',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('LIST_NOT_IN_ORGANIZATION');

      const stillInbox = await captureStore.findById(capture.id);
      expect(stillInbox._unsafeUnwrap()?.status).toBe('inbox');
    });

    it('rejects a list from another organization', async () => {
      const capture = createInboxCapture();
      await captureStore.save(capture);

      const result = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
        listId: otherOrgList.id,
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('LIST_NOT_IN_ORGANIZATION');
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
        organizationId: 'org-1',
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
      const capture = createInboxCapture();
      await captureStore.save(capture);

      const firstResult = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
      });
      expect(firstResult.isOk()).toBe(true);

      const updatedCapture = await captureStore.findById(capture.id);
      expect(updatedCapture._unsafeUnwrap()?.status).toBe('processed');

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

      const processResult = await service.processCaptureToTask({
        id: capture.id,
        organizationId: 'org-1',
        createdById: 'user-1',
      });
      expect(processResult.isOk()).toBe(true);
      const task = processResult._unsafeUnwrap();

      const deleteResult = await service.deleteTaskWithCascade({
        id: task.id,
        organizationId: 'org-1',
      });

      expect(deleteResult.isOk()).toBe(true);

      const foundTask = await taskStore.findById(task.id);
      expect(foundTask._unsafeUnwrap()).toBeNull();

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
        organizationId: 'org-1',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('TASK_NOT_FOUND');
    });
  });
});
