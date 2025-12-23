import { usingDrivers, describe, it, expect, beforeEach } from './harness.js';
import type { CoreActor } from '../dsl/index.js';
import { NotFoundError, ValidationError } from '../dsl/index.js';

usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Organizing work [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice@example.com');
    });

    it('can trash a capture', async () => {
      const capture = await alice.createCapture({ content: 'Done with this' });

      const trashed = await alice.trashCapture(capture.id);

      expect(trashed.status).toBe('trashed');
    });

    it('can restore a capture', async () => {
      const capture = await alice.createCapture({ content: 'Maybe not done' });
      await alice.trashCapture(capture.id);

      const restored = await alice.restoreCapture(capture.id);

      expect(restored.status).toBe('inbox');
    });

    it('removes trashed captures from inbox list', async () => {
      const capture = await alice.createCapture({ content: `trash-test-${Date.now()}` });
      await alice.trashCapture(capture.id);

      const inboxCaptures = await alice.listCaptures();

      expect(inboxCaptures.some((c) => c.content === capture.content)).toBe(false);
    });

    it('shows trashed captures in trash list', async () => {
      const capture = await alice.createCapture({ content: `trashed-list-${Date.now()}` });
      await alice.trashCapture(capture.id);

      const trashedCaptures = await alice.listTrashedCaptures();

      expect(trashedCaptures.some((c) => c.content === capture.content)).toBe(true);
    });

    it('moves restored captures back to inbox list', async () => {
      const capture = await alice.createCapture({ content: `restore-test-${Date.now()}` });
      await alice.trashCapture(capture.id);
      await alice.restoreCapture(capture.id);

      const inboxCaptures = await alice.listCaptures();
      const trashedCaptures = await alice.listTrashedCaptures();

      expect(inboxCaptures.some((c) => c.content === capture.content)).toBe(true);
      expect(trashedCaptures.some((c) => c.content === capture.content)).toBe(false);
    });

    it('can update capture content', async () => {
      const capture = await alice.createCapture({ content: 'Original' });

      const updated = await alice.updateCapture(capture.id, {
        content: 'Updated',
      });

      expect(updated.content).toBe('Updated');
    });

    it('returns not found for non-existent capture', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(alice.getCapture(nonExistentId)).rejects.toThrow(NotFoundError);
    });

    it('returns not found when trashing non-existent capture', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(alice.trashCapture(nonExistentId)).rejects.toThrow(
        NotFoundError
      );
    });

    it('returns not found when updating non-existent capture', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(
        alice.updateCapture(nonExistentId, { content: 'Updated' })
      ).rejects.toThrow(NotFoundError);
    });

    it('can pin a capture', async () => {
      const capture = await alice.createCapture({ content: 'Important note' });

      const pinned = await alice.pinCapture(capture.id);

      expect(pinned.pinnedAt).toBeDefined();
    });

    it('can unpin a capture', async () => {
      const capture = await alice.createCapture({ content: 'Less important' });
      await alice.pinCapture(capture.id);

      const unpinned = await alice.unpinCapture(capture.id);

      expect(unpinned.pinnedAt).toBeUndefined();
    });

    it('pinned captures appear before unpinned in inbox', async () => {
      // Create captures with slight delay to ensure different timestamps
      const first = await alice.createCapture({ content: `first-${Date.now()}` });
      await alice.createCapture({ content: `second-${Date.now()}` });

      // Pin the first (older) capture
      await alice.pinCapture(first.id);

      const captures = await alice.listCaptures();

      // Pinned capture should come first, even though it's older
      expect(captures[0].id).toBe(first.id);
    });

    it('trashing a pinned capture automatically unpins it', async () => {
      const capture = await alice.createCapture({ content: 'Will be trashed' });
      await alice.pinCapture(capture.id);

      const trashed = await alice.trashCapture(capture.id);

      expect(trashed.pinnedAt).toBeUndefined();
    });

    it('returns not found when pinning non-existent capture', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(alice.pinCapture(nonExistentId)).rejects.toThrow(NotFoundError);
    });
  });
});

// API-specific validation tests (not applicable to UI)
usingDrivers(['http'] as const, (ctx) => {
  describe(`Organizing work - API validation [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice@example.com');
    });

    it('can add a title to a capture', async () => {
      const capture = await alice.createCapture({ content: 'Some note' });

      const updated = await alice.updateCapture(capture.id, {
        title: 'Important!',
      });

      expect(updated.title).toBe('Important!');
    });

    it('returns trashedAt when trashing', async () => {
      const capture = await alice.createCapture({ content: 'Done with this' });

      const trashed = await alice.trashCapture(capture.id);

      expect(trashed.trashedAt).toBeDefined();
    });

    it('clears trashedAt when restoring', async () => {
      const capture = await alice.createCapture({ content: 'Maybe not done' });
      await alice.trashCapture(capture.id);

      const restored = await alice.restoreCapture(capture.id);

      expect(restored.trashedAt).toBeUndefined();
    });

    it('rejects invalid capture id format', async () => {
      await expect(alice.getCapture('not-a-uuid')).rejects.toThrow(
        ValidationError
      );
    });

    it('rejects invalid id format when updating', async () => {
      await expect(
        alice.updateCapture('not-a-uuid', { content: 'test' })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects invalid id format when trashing', async () => {
      await expect(alice.trashCapture('not-a-uuid')).rejects.toThrow(
        ValidationError
      );
    });
  });
});
