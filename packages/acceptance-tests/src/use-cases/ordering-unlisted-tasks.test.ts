import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { CoreActor, BrowserActor, AnonymousActor } from '@yoink/acceptance-testing';
import { UnauthorizedError, ConflictError } from '@yoink/acceptance-testing';

/**
 * Story 8: Order unlisted tasks.
 *
 * A member can see the open tasks that are not on a named list, in an
 * order, and change that order. Same Polly lock as story 7, on the
 * unlisted pile only — not a global rank across All/Today/Mine/Upcoming.
 * Pin stays on top of those filters and is not this order.
 */
usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Ordering unlisted tasks [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let anonymous: AnonymousActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-order-unlisted@example.com');
      anonymous = ctx.createAnonymousActor();
    });

    it('lists open unlisted tasks in the order they were added', async () => {
      await alice.createTask({ title: 'Notes' });
      await alice.createTask({ title: 'Errand' });
      await alice.createTask({ title: 'Call' });
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id });

      const tasks = await alice.listUnlistedOpenTasks();

      expect(tasks.map((task) => task.title)).toEqual(['Notes', 'Errand', 'Call']);
    });

    it('changes the unlisted open-task order', async () => {
      const notes = await alice.createTask({ title: 'Notes' });
      const errand = await alice.createTask({ title: 'Errand' });
      const call = await alice.createTask({ title: 'Call' });

      const reordered = await alice.reorderUnlistedOpenTasks([
        errand.id,
        notes.id,
        call.id,
      ]);

      expect(reordered.map((task) => task.title)).toEqual(['Errand', 'Notes', 'Call']);

      const listed = await alice.listUnlistedOpenTasks();
      expect(listed.map((task) => task.title)).toEqual(['Errand', 'Notes', 'Call']);
    });

    it('requires authentication to see or change unlisted open order', async () => {
      await expect(anonymous.listUnlistedOpenTasks()).rejects.toThrow(UnauthorizedError);
      await expect(anonymous.reorderUnlistedOpenTasks([])).rejects.toThrow(UnauthorizedError);
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Ordering unlisted tasks — API [${ctx.driverName}]`, () => {
    it('lets an agent token reorder unlisted open tasks in the same organization', async () => {
      const alice = await ctx.createActor('alice-order-unlisted-agent@example.com');
      const first = await alice.createTask({ title: 'First' });
      const second = await alice.createTask({ title: 'Second' });

      const minted = await alice.mintAgent('Unlisted sorter');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const reordered = await bot.reorderUnlistedOpenTasks([second.id, first.id]);

      expect(reordered.map((task) => task.title)).toEqual(['Second', 'First']);
    });

    it('refuses to reorder a completed unlisted task', async () => {
      const alice = await ctx.createActor('alice-order-unlisted-done@example.com');
      const notes = await alice.createTask({ title: 'Notes' });
      const errand = await alice.createTask({ title: 'Errand' });
      await alice.completeTask(errand.id);

      await expect(
        alice.reorderUnlistedOpenTasks([notes.id, errand.id])
      ).rejects.toThrow(ConflictError);

      const listed = await alice.listUnlistedOpenTasks();
      expect(listed.map((task) => task.title)).toEqual(['Notes']);
    });

    it('puts a new unlisted task and a take-off at the end of the unlisted open pile', async () => {
      const alice = await ctx.createActor('alice-order-unlisted-append@example.com');
      const existing = await alice.createTask({ title: 'Notes' });
      const created = await alice.createTask({ title: 'Errand' });
      const list = await alice.createNamedList('Groceries');
      const fromList = await alice.createTask({ title: 'Taken off', listId: list.id });
      await alice.updateTask(fromList.id, { listId: null });

      const listed = await alice.listUnlistedOpenTasks();
      expect(listed.map((task) => task.id)).toEqual([existing.id, created.id, fromList.id]);
    });

    it('restores a completed unlisted task at its remembered index and clamps when the pile is shorter', async () => {
      const alice = await ctx.createActor('alice-order-unlisted-restore@example.com');
      await alice.createTask({ title: 'Notes' });
      const errand = await alice.createTask({ title: 'Errand' });
      const call = await alice.createTask({ title: 'Call' });

      await alice.completeTask(errand.id);
      expect((await alice.listUnlistedOpenTasks()).map((task) => task.title)).toEqual([
        'Notes',
        'Call',
      ]);

      await alice.uncompleteTask(errand.id);
      expect((await alice.listUnlistedOpenTasks()).map((task) => task.title)).toEqual([
        'Notes',
        'Errand',
        'Call',
      ]);

      await alice.completeTask(call.id);
      await alice.completeTask(errand.id);
      await alice.uncompleteTask(call.id);

      expect((await alice.listUnlistedOpenTasks()).map((task) => task.title)).toEqual([
        'Notes',
        'Call',
      ]);
    });

    it('keeps named-list reorder working', async () => {
      const alice = await ctx.createActor('alice-order-unlisted-regression@example.com');
      const list = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: list.id });
      const eggs = await alice.createTask({ title: 'Eggs', listId: list.id });
      await alice.createTask({ title: 'Notes' });

      const reordered = await alice.reorderOpenTasksOnList(list.id, [eggs.id, milk.id]);
      expect(reordered.map((task) => task.title)).toEqual(['Eggs', 'Milk']);

      expect((await alice.listUnlistedOpenTasks()).map((task) => task.title)).toEqual([
        'Notes',
      ]);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Ordering unlisted tasks on the board [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-order-unlisted-board@example.com');
    });

    it('shows unlisted open tasks in order and keeps a kit reorder after refresh', async () => {
      await alice.createTask({ title: 'Notes' });
      await alice.createTask({ title: 'Errand' });
      await alice.createTask({ title: 'Call' });

      await alice.openUnlistedPile();
      await alice.shouldSeeOpenTasksInOrder(['Notes', 'Errand', 'Call']);

      await alice.moveOpenTask('Notes', 'down');
      await alice.shouldSeeOpenTasksInOrder(['Errand', 'Notes', 'Call']);

      await alice.refreshOpenList();
      await alice.shouldSeeOpenTasksInOrder(['Errand', 'Notes', 'Call']);
    });
  });
});
