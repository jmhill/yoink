import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { CoreActor, BrowserActor } from '@yoink/acceptance-testing';
import { UnauthorizedError } from '@yoink/acceptance-testing';

/**
 * Story 1: View my named lists.
 *
 * A list is an optional bucket on a task — this story only shows the org's
 * named lists (including empty ones). Create/rename/delete stay out.
 */
usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Viewing named lists [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-lists@example.com');
    });

    it('shows the lists view with no lists when the organization has none', async () => {
      const lists = await alice.listNamedLists();

      expect(lists).toEqual([]);
    });

    it('shows seeded list names', async () => {
      await alice.seedNamedList('Groceries');
      await alice.seedNamedList('Weekend');

      const lists = await alice.listNamedLists();

      expect(lists.map((list) => list.name)).toEqual(
        expect.arrayContaining(['Groceries', 'Weekend'])
      );
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Viewing named lists — API [${ctx.driverName}]`, () => {
    it('requires authentication', async () => {
      const anonymous = ctx.createAnonymousActor();

      await expect(anonymous.listNamedLists()).rejects.toThrow(UnauthorizedError);
    });

    it('lets an agent token view the same organization lists', async () => {
      const alice = await ctx.createActor('alice-lists-agent@example.com');
      await alice.seedNamedList('Shared board');

      const minted = await alice.mintAgent('List reader');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const lists = await bot.listNamedLists();

      expect(lists.map((list) => list.name)).toContain('Shared board');
    });

    it('does not show another organization\'s lists', async () => {
      const alice = await ctx.createActor('alice-lists-iso@example.com');
      const bob = await ctx.createActor('bob-lists-iso@example.com');

      await alice.seedNamedList('Alice only');

      const bobLists = await bob.listNamedLists();

      expect(bobLists.map((list) => list.name)).not.toContain('Alice only');
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Viewing named lists on the board [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-lists-board@example.com');
    });

    it('opens the lists view and shows the empty state', async () => {
      await alice.shouldSeeEmptyNamedLists();
    });

    it('shows seeded names on the lists view', async () => {
      await alice.seedNamedList('Groceries');
      await alice.seedNamedList('Weekend');

      await alice.shouldSeeNamedList('Groceries');
      await alice.shouldSeeNamedList('Weekend');
    });
  });
});
