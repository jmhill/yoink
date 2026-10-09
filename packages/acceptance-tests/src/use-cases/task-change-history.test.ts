import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';

/**
 * Issue #133 part 1: every task/list change is recorded.
 *
 * Case map:
 * 1. Create/edit/complete/uncomplete/move/delete persist (lastChangedAt / 204)
 * 2. List create/rename/delete still work (existing list tests + rename here)
 * 3. Edit screen shows added / last changed / completed [playwright]
 * 4. Bots get the same dates in the API (http)
 * 5. Pre-history lastChangedAt is null [api sqlite test]
 * 6. Existing write behaviour unchanged aside from new fields
 * 7. Typed records [domain parse tests]
 * 8. Command log line [withCommandLog unit test]
 */

usingDrivers(['http'] as const, (ctx) => {
  describe(`Task change history API [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-change-log@example.com');
    });

    it('adds lastChangedAt on create and keeps lastChangedBy null until actors land', async () => {
      const task = await alice.createTask({ title: 'Buy milk' });

      expect(task.title).toBe('Buy milk');
      expect(task.createdAt).toBeDefined();
      expect(task.createdById).toBe(alice.userId);
      expect(task.lastChangedAt).toBeDefined();
      expect(task.lastChangedAt).not.toBeNull();
      expect(task.lastChangedBy).toBeNull();
      expect(task.completedBy ?? null).toBeNull();
    });

    it('updates lastChangedAt on edit, complete, uncomplete, and move — not on reorder or pin', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: groceries.id });
      const bread = await alice.createTask({ title: 'Bread', listId: groceries.id });
      const createdChangedAt = milk.lastChangedAt;

      const edited = await alice.updateTask(milk.id, { title: 'Oat milk' });
      expect(edited.title).toBe('Oat milk');
      expect(edited.lastChangedAt).not.toBe(createdChangedAt);

      const afterEdit = edited.lastChangedAt;
      const completed = await alice.completeTask(milk.id);
      expect(completed.completedAt).toBeDefined();
      expect(completed.completedBy ?? null).toBeNull();
      expect(completed.lastChangedAt).not.toBe(afterEdit);

      const afterComplete = completed.lastChangedAt;
      const reopened = await alice.uncompleteTask(milk.id);
      expect(reopened.completedAt).toBeUndefined();
      expect(reopened.lastChangedAt).not.toBe(afterComplete);

      const afterUncomplete = reopened.lastChangedAt;
      const moved = await alice.updateTask(milk.id, { listId: null });
      expect(moved.listId).toBeUndefined();
      expect(moved.lastChangedAt).not.toBe(afterUncomplete);

      const afterMove = moved.lastChangedAt;
      const pinned = await alice.pinTask(milk.id);
      expect(pinned.pinnedAt).toBeDefined();
      expect(pinned.lastChangedAt).toBe(afterMove);

      const reordered = await alice.reorderOpenTasksOnList(groceries.id, [bread.id]);
      expect(reordered.some((task) => task.id === bread.id)).toBe(true);
      const breadAfter = await alice.getTask(bread.id);
      expect(breadAfter.lastChangedAt).toBe(bread.lastChangedAt);
    });

    it('deletes a task the same way —  responses stay 204', async () => {
      const task = await alice.createTask({ title: 'Throw away' });
      await alice.deleteTask(task.id);
      await expect(alice.getTask(task.id)).rejects.toThrow();
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Task change history UI [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-change-log-ui@example.com');
    });

    it('shows added, last changed, and completed on the task edit screen', async () => {
      const task = await alice.createTask({ title: 'Milk' });

      await alice.useDesktopViewport();
      await alice.openRailUnlisted();
      await alice.openTaskEditFromRow(task.id);
      await alice.shouldSeeTaskEditChangeHistory();
      await alice.closeTaskEdit();

      await alice.completeTask(task.id);
      await alice.openRailSmartView('done');
      await alice.openTaskEditFromRow(task.id);
      await alice.shouldSeeTaskEditChangeHistory({ completed: true });
      await alice.closeTaskEdit();
    });
  });
});
