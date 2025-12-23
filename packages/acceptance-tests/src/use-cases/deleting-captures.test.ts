import { usingDrivers, describe, it, expect, beforeEach } from './harness.js';
import type { CoreActor } from '../dsl/index.js';
import { NotFoundError, ConflictError } from '../dsl/index.js';

usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Deleting captures [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice@example.com');
    });

    it('can permanently delete a trashed capture', async () => {
      const capture = await alice.createCapture({ content: 'Delete me' });
      await alice.trashCapture(capture.id);

      await alice.deleteCapture(capture.id);

      // Verify the capture no longer exists
      await expect(alice.getCapture(capture.id)).rejects.toThrow(NotFoundError);
    });

    it('deleted captures do not appear in inbox list', async () => {
      const capture = await alice.createCapture({
        content: `delete-inbox-${Date.now()}`,
      });
      await alice.trashCapture(capture.id);
      await alice.deleteCapture(capture.id);

      const inboxCaptures = await alice.listCaptures();

      expect(inboxCaptures.some((c) => c.content === capture.content)).toBe(false);
    });

    it('deleted captures do not appear in trash list', async () => {
      const capture = await alice.createCapture({
        content: `delete-trash-${Date.now()}`,
      });
      await alice.trashCapture(capture.id);
      await alice.deleteCapture(capture.id);

      const trashedCaptures = await alice.listTrashedCaptures();

      expect(trashedCaptures.some((c) => c.content === capture.content)).toBe(false);
    });

    describe('empty trash', () => {
      it('permanently deletes all trashed captures', async () => {
        const capture1 = await alice.createCapture({
          content: `empty-trash-1-${Date.now()}`,
        });
        const capture2 = await alice.createCapture({
          content: `empty-trash-2-${Date.now()}`,
        });
        await alice.trashCapture(capture1.id);
        await alice.trashCapture(capture2.id);

        const result = await alice.emptyTrash();

        expect(result.deletedCount).toBe(2);

        // Verify both captures no longer exist
        await expect(alice.getCapture(capture1.id)).rejects.toThrow(NotFoundError);
        await expect(alice.getCapture(capture2.id)).rejects.toThrow(NotFoundError);
      });

      it('returns zero when trash is already empty', async () => {
        const result = await alice.emptyTrash();

        expect(result.deletedCount).toBe(0);
      });

      it('does not delete inbox captures', async () => {
        const inboxCapture = await alice.createCapture({
          content: `inbox-safe-${Date.now()}`,
        });
        const trashedCapture = await alice.createCapture({
          content: `trashed-${Date.now()}`,
        });
        await alice.trashCapture(trashedCapture.id);

        await alice.emptyTrash();

        // Inbox capture should still exist
        const retrieved = await alice.getCapture(inboxCapture.id);
        expect(retrieved.content).toBe(inboxCapture.content);

        // Trashed capture should be gone
        await expect(alice.getCapture(trashedCapture.id)).rejects.toThrow(
          NotFoundError
        );
      });

      it('leaves trash empty after completion', async () => {
        const capture = await alice.createCapture({
          content: `empty-check-${Date.now()}`,
        });
        await alice.trashCapture(capture.id);

        await alice.emptyTrash();

        const trashedCaptures = await alice.listTrashedCaptures();
        expect(trashedCaptures).toHaveLength(0);
      });
    });
  });
});

// HTTP-only tests for API-specific behavior
usingDrivers(['http'] as const, (ctx) => {
  describe(`Deleting captures - API validation [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice@example.com');
    });

    it('cannot delete a capture that is not in trash', async () => {
      const capture = await alice.createCapture({ content: 'Still in inbox' });

      await expect(alice.deleteCapture(capture.id)).rejects.toThrow(ConflictError);
    });

    it('returns not found when deleting non-existent capture', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(alice.deleteCapture(nonExistentId)).rejects.toThrow(
        NotFoundError
      );
    });
  });
});
