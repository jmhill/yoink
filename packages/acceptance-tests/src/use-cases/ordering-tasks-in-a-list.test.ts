import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { CoreActor, BrowserActor, AnonymousActor } from '@yoink/acceptance-testing';
import { UnauthorizedError, ConflictError, NotFoundError } from '@yoink/acceptance-testing';

/**
 * Story 7: Order tasks in a list.
 *
 * A member can see the open tasks on a named list in an order, and change
 * that order. Open order is among open tasks only. New tasks and moves onto
 * a list land at the end. Completing drops a task out of the sequence but
 * keeps listId and the remembered index. Uncomplete restores (clamped to
 * the end if the list got shorter). Take-off appends to the unlisted pile
 * (domain only). Pin is a separate thing.
 */
usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Ordering tasks in a list [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let anonymous: AnonymousActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-order-list@example.com');
      anonymous = ctx.createAnonymousActor();
    });

    it('lists open tasks on a named list in the order they were added', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id });
      await alice.createTask({ title: 'Eggs', listId: list.id });
      await alice.createTask({ title: 'Bread', listId: list.id });

      const tasks = await alice.listOpenTasksOnList(list.id);

      expect(tasks.map((task) => task.title)).toEqual(['Milk', 'Eggs', 'Bread']);
    });

    it('changes the open-task order', async () => {
      const list = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: list.id });
      const eggs = await alice.createTask({ title: 'Eggs', listId: list.id });
      const bread = await alice.createTask({ title: 'Bread', listId: list.id });

      const reordered = await alice.reorderOpenTasksOnList(list.id, [
        eggs.id,
        milk.id,
        bread.id,
      ]);

      expect(reordered.map((task) => task.title)).toEqual(['Eggs', 'Milk', 'Bread']);

      const listed = await alice.listOpenTasksOnList(list.id);
      expect(listed.map((task) => task.title)).toEqual(['Eggs', 'Milk', 'Bread']);
    });

    it('requires authentication to see or change open order', async () => {
      await expect(
        anonymous.listOpenTasksOnList('550e8400-e29b-41d4-a716-446655440000')
      ).rejects.toThrow(UnauthorizedError);
      await expect(
        anonymous.reorderOpenTasksOnList('550e8400-e29b-41d4-a716-446655440000', [])
      ).rejects.toThrow(UnauthorizedError);
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Ordering tasks in a list — API [${ctx.driverName}]`, () => {
    it('lets an agent token reorder open tasks in the same organization', async () => {
      const alice = await ctx.createActor('alice-order-list-agent@example.com');
      const list = await alice.createNamedList('Shared board');
      const first = await alice.createTask({ title: 'First', listId: list.id });
      const second = await alice.createTask({ title: 'Second', listId: list.id });

      const minted = await alice.mintAgent('List sorter');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const reordered = await bot.reorderOpenTasksOnList(list.id, [second.id, first.id]);

      expect(reordered.map((task) => task.title)).toEqual(['Second', 'First']);
    });

    it('does not find another organization\'s list', async () => {
      const alice = await ctx.createActor('alice-order-list-iso@example.com');
      const bob = await ctx.createActor('bob-order-list-iso@example.com');
      const aliceList = await alice.createNamedList('Alice only');
      await alice.createTask({ title: 'Milk', listId: aliceList.id });

      await expect(bob.listOpenTasksOnList(aliceList.id)).rejects.toThrow(NotFoundError);
      await expect(bob.reorderOpenTasksOnList(aliceList.id, [])).rejects.toThrow(NotFoundError);
    });

    it('refuses to reorder a completed task', async () => {
      const alice = await ctx.createActor('alice-order-list-done@example.com');
      const list = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({ title: 'Milk', listId: list.id });
      const eggs = await alice.createTask({ title: 'Eggs', listId: list.id });
      await alice.completeTask(eggs.id);

      await expect(
        alice.reorderOpenTasksOnList(list.id, [milk.id, eggs.id])
      ).rejects.toThrow(ConflictError);

      const listed = await alice.listOpenTasksOnList(list.id);
      expect(listed.map((task) => task.title)).toEqual(['Milk']);
    });

    it('puts a new task and a moved-on task at the end of the open list', async () => {
      const alice = await ctx.createActor('alice-order-list-append@example.com');
      const list = await alice.createNamedList('Groceries');
      const existing = await alice.createTask({ title: 'Milk', listId: list.id });
      const created = await alice.createTask({ title: 'Eggs', listId: list.id });
      const moved = await alice.createTask({ title: 'Bread' });
      await alice.updateTask(moved.id, { listId: list.id });

      const listed = await alice.listOpenTasksOnList(list.id);
      expect(listed.map((task) => task.id)).toEqual([existing.id, created.id, moved.id]);
    });

    it('restores a completed task at its remembered index and clamps when the list is shorter', async () => {
      const alice = await ctx.createActor('alice-order-list-restore@example.com');
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id });
      const eggs = await alice.createTask({ title: 'Eggs', listId: list.id });
      const bread = await alice.createTask({ title: 'Bread', listId: list.id });

      await alice.completeTask(eggs.id);
      expect((await alice.listOpenTasksOnList(list.id)).map((task) => task.title)).toEqual([
        'Milk',
        'Bread',
      ]);

      await alice.uncompleteTask(eggs.id);
      expect((await alice.listOpenTasksOnList(list.id)).map((task) => task.title)).toEqual([
        'Milk',
        'Eggs',
        'Bread',
      ]);

      await alice.completeTask(bread.id);
      await alice.completeTask(eggs.id);
      await alice.uncompleteTask(bread.id);

      expect((await alice.listOpenTasksOnList(list.id)).map((task) => task.title)).toEqual([
        'Milk',
        'Bread',
      ]);
    });

    it('appends take-off to the unlisted open pile', async () => {
      const alice = await ctx.createActor('alice-order-list-takeoff@example.com');
      const list = await alice.createNamedList('Groceries');
      const firstUnlisted = await alice.createTask({ title: 'Loose end' });
      const fromList = await alice.createTask({ title: 'Taken off', listId: list.id });

      await alice.updateTask(fromList.id, { listId: null });

      const unlisted = await alice.getTask(fromList.id);
      expect(unlisted.listId).toBeUndefined();
      expect(unlisted.openOrder).toBeGreaterThan(firstUnlisted.openOrder ?? -1);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Ordering tasks in a list on the board [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-order-list-board@example.com');
    });

    it('shows open tasks in order and keeps a kit reorder after refresh', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id });
      await alice.createTask({ title: 'Eggs', listId: list.id });
      await alice.createTask({ title: 'Bread', listId: list.id });

      await alice.openNamedList('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Bread']);

      await alice.moveOpenTask('Milk', 'down');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk', 'Bread']);

      await alice.refreshOpenList();
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk', 'Bread']);
    });
  });
});
