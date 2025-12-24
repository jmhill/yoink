import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { CoreActor } from '@yoink/acceptance-testing';
import { NotFoundError, ValidationError } from '@yoink/acceptance-testing';

// HTTP-only tests for now (Playwright will be enabled when UI is built)
usingDrivers(['http'] as const, (ctx) => {
  describe(`Processing captures to tasks [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice@example.com');
    });

    describe('processing captures', () => {
      it('can process a capture to a task', async () => {
        const capture = await alice.createCapture({ content: 'Need to buy milk' });

        const task = await alice.processCaptureToTask(capture.id);

        expect(task.title).toBe('Need to buy milk');
        expect(task.captureId).toBe(capture.id);
      });

      it('uses custom title when provided', async () => {
        const capture = await alice.createCapture({ content: 'Long rambling note about groceries' });

        const task = await alice.processCaptureToTask(capture.id, {
          title: 'Buy groceries',
        });

        expect(task.title).toBe('Buy groceries');
      });

      it('sets due date when provided', async () => {
        const capture = await alice.createCapture({ content: 'Something urgent' });

        const task = await alice.processCaptureToTask(capture.id, {
          dueDate: '2024-12-31',
        });

        expect(task.dueDate).toBe('2024-12-31');
      });

      it('marks the capture as processed', async () => {
        const capture = await alice.createCapture({ content: 'Process me' });

        const task = await alice.processCaptureToTask(capture.id);

        // Verify capture is now processed
        const updatedCapture = await alice.getCapture(capture.id);
        expect(updatedCapture.status).toBe('processed');
        expect(updatedCapture.processedToType).toBe('task');
        expect(updatedCapture.processedToId).toBe(task.id);
      });

      it('removes processed capture from inbox list', async () => {
        const capture = await alice.createCapture({ content: `process-test-${Date.now()}` });

        await alice.processCaptureToTask(capture.id);

        const inboxCaptures = await alice.listCaptures();
        expect(inboxCaptures.some((c) => c.id === capture.id)).toBe(false);
      });
    });

    describe('cascade delete', () => {
      it('deleting a task also deletes its source capture', async () => {
        const capture = await alice.createCapture({ content: 'Will be deleted with task' });
        const task = await alice.processCaptureToTask(capture.id);

        await alice.deleteTask(task.id);

        // Both task and capture should be gone
        await expect(alice.getTask(task.id)).rejects.toThrow(NotFoundError);
        await expect(alice.getCapture(capture.id)).rejects.toThrow(NotFoundError);
      });

      it('deleting a task without capture does not error', async () => {
        const task = await alice.createTask({ title: 'Direct task without capture' });

        // Should not throw
        await alice.deleteTask(task.id);

        await expect(alice.getTask(task.id)).rejects.toThrow(NotFoundError);
      });
    });

    describe('error handling', () => {
      it('cannot process non-existent capture', async () => {
        const nonExistentId = '00000000-0000-0000-0000-000000000000';

        await expect(alice.processCaptureToTask(nonExistentId)).rejects.toThrow(NotFoundError);
      });

      it('cannot process trashed capture', async () => {
        const capture = await alice.createCapture({ content: 'Trashed capture' });
        await alice.trashCapture(capture.id);

        await expect(alice.processCaptureToTask(capture.id)).rejects.toThrow(ValidationError);
      });

      it('cannot process already processed capture', async () => {
        const capture = await alice.createCapture({ content: 'Already processed' });
        await alice.processCaptureToTask(capture.id);

        await expect(alice.processCaptureToTask(capture.id)).rejects.toThrow(ValidationError);
      });
    });
  });
});
