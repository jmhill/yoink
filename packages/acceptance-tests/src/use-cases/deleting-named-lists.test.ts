import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { CoreActor, BrowserActor, AnonymousActor } from '@yoink/acceptance-testing';
import { UnauthorizedError, ConflictError } from '@yoink/acceptance-testing';

/**
 * Story 6: Delete an empty named list.
 *
 * A member can delete a named list that has no open tasks. Completed tasks
 * on that list are unlisted in the same command and stay in Done. After
 * delete, the name is free again. Humans (session) and agent tokens can
 * both delete.
 */
usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Deleting named lists [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let anonymous: AnonymousActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-delete-list@example.com');
      anonymous = ctx.createAnonymousActor();
    });

    it('deletes a list with no open tasks', async () => {
      const list = await alice.createNamedList('Groceries');

      await alice.deleteNamedList(list.id);

      const lists = await alice.listNamedLists();
      expect(lists.map((item) => item.name)).not.toContain('Groceries');
    });

    it('refuses delete when an open task is still on the list', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Buy milk', listId: list.id });

      await expect(alice.deleteNamedList(list.id)).rejects.toThrow(ConflictError);

      const lists = await alice.listNamedLists();
      expect(lists.map((item) => item.name)).toContain('Groceries');
    });

    it('deletes a list that only has completed tasks on it', async () => {
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Buy milk', listId: list.id });
      await alice.completeTask(task.id);

      await alice.deleteNamedList(list.id);

      const lists = await alice.listNamedLists();
      expect(lists.map((item) => item.name)).not.toContain('Groceries');
    });

    it('frees the name so it can be created again', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.deleteNamedList(list.id);

      const again = await alice.createNamedList('groceries');

      expect(again.name).toBe('groceries');
      expect(again.id).not.toBe(list.id);
    });

    it('requires authentication to delete a list', async () => {
      await expect(
        anonymous.deleteNamedList('550e8400-e29b-41d4-a716-446655440000')
      ).rejects.toThrow(UnauthorizedError);
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Deleting named lists — API [${ctx.driverName}]`, () => {
    it('lets an agent token delete a named list in the same organization', async () => {
      const alice = await ctx.createActor('alice-delete-list-agent@example.com');
      const list = await alice.createNamedList('Bot board');

      const minted = await alice.mintAgent('List deleter');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      await bot.deleteNamedList(list.id);

      const lists = await alice.listNamedLists();
      expect(lists.map((item) => item.name)).not.toContain('Bot board');
    });

    it('unlists completed tasks on the list and does not attach them to a recreated name', async () => {
      const alice = await ctx.createActor('alice-delete-list-unlist-done@example.com');
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Buy milk', listId: list.id });
      await alice.completeTask(task.id);

      await alice.deleteNamedList(list.id);

      const done = await alice.getTask(task.id);
      expect(done.listId).toBeUndefined();
      expect(done.completedAt).toBeDefined();

      const restored = await alice.uncompleteTask(task.id);
      expect(restored.listId).toBeUndefined();

      const again = await alice.createNamedList('Groceries');
      const afterReuse = await alice.getTask(task.id);
      expect(afterReuse.listId).toBeUndefined();
      expect(again.id).not.toBe(list.id);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Deleting named lists on the board [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-delete-list-board@example.com');
    });

    it('removes the list from the lists view after deleting from the kit dialog', async () => {
      const list = await alice.createNamedList('Weekend');

      await alice.deleteNamedList(list.id);

      await alice.shouldNotSeeNamedList('Weekend');
    });
  });
});
