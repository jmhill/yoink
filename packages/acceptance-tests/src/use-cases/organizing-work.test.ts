import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { CoreActor } from '@yoink/acceptance-testing';
import { NotFoundError, ValidationError } from '@yoink/acceptance-testing';

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
