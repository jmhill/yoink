import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { CoreActor, BrowserActor, AnonymousActor } from '@yoink/acceptance-testing';
import { UnauthorizedError, ValidationError } from '@yoink/acceptance-testing';

/**
 * Story 5: Take a task off a list.
 *
 * A list is an optional single bucket. This story clears listId to unlisted.
 * Only open tasks may be taken off. Already-unlisted is a no-op. Completed
 * stays put so uncomplete still restores the same list.
 */
usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Taking a task off a list [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let anonymous: AnonymousActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-task-unlist@example.com');
      anonymous = ctx.createAnonymousActor();
    });

    it('takes an open task off a list so it is then unlisted', async () => {
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Buy milk', listId: list.id });
      expect(task.listId).toBe(list.id);

      const updated = await alice.updateTask(task.id, { listId: null });

      expect(updated.listId).toBeUndefined();
    });

    it('is a no-op when the task is already unlisted', async () => {
      const task = await alice.createTask({ title: 'Loose end' });
      expect(task.listId).toBeUndefined();

      const again = await alice.updateTask(task.id, { listId: null });

      expect(again.listId).toBeUndefined();
    });

    it('requires authentication to take a task off a list', async () => {
      await expect(
        anonymous.updateTask('550e8400-e29b-41d4-a716-446655440000', {
          listId: null,
        })
      ).rejects.toThrow(UnauthorizedError);
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Taking a task off a list — API [${ctx.driverName}]`, () => {
    it('lets an agent token take a task off a list in the same organization', async () => {
      const alice = await ctx.createActor('alice-task-unlist-agent@example.com');
      const list = await alice.createNamedList('Shared board');
      const task = await alice.createTask({ title: 'Bot chore', listId: list.id });

      const minted = await alice.mintAgent('List clearer');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const updated = await bot.updateTask(task.id, { listId: null });

      expect(updated.listId).toBeUndefined();
    });

    it('rejects taking a completed task off a list so the stored list stays', async () => {
      const alice = await ctx.createActor('alice-task-unlist-done@example.com');
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Buy milk', listId: list.id });
      await alice.completeTask(task.id);

      await expect(alice.updateTask(task.id, { listId: null })).rejects.toThrow(
        ValidationError
      );

      const done = await alice.getTask(task.id);
      expect(done.listId).toBe(list.id);
      expect(done.completedAt).toBeDefined();
    });

    it('still restores the same list on uncomplete after a rejected take-off', async () => {
      const alice = await ctx.createActor('alice-task-unlist-restore@example.com');
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Buy milk', listId: list.id });
      await alice.completeTask(task.id);

      await expect(alice.updateTask(task.id, { listId: null })).rejects.toThrow(
        ValidationError
      );

      const restored = await alice.uncompleteTask(task.id);
      expect(restored.listId).toBe(list.id);
      expect(restored.completedAt).toBeUndefined();
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Taking a task off a list on the board [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-task-unlist-board@example.com');
    });

    it('clears the list from the kit Select so the row is unlisted', async () => {
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Buy milk', listId: list.id });

      await alice.updateTask(task.id, { listId: null });

      await alice.shouldNotSeeListOnTask(task.id);
    });
  });
});
