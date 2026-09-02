import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { CoreActor, BrowserActor, AnonymousActor } from '@yoink/acceptance-testing';
import { UnauthorizedError, ValidationError, ConflictError } from '@yoink/acceptance-testing';

/**
 * Story 2: Create a new named list.
 *
 * Any org member (human session or agent token) can name a new list.
 * After create, it appears in All’s pile dropdown, including when it has
 * no tasks. This is not tags; tasks are untouched.
 */
usingDrivers(['http', 'playwright'] as const, (ctx) => {
  describe(`Creating named lists [${ctx.driverName}]`, () => {
    let alice: CoreActor;
    let anonymous: AnonymousActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-create-list@example.com');
      anonymous = ctx.createAnonymousActor();
    });

    it('lets a member create a named list and see it among the org lists', async () => {
      const list = await alice.createNamedList('Groceries');

      expect(list.name).toBe('Groceries');
      expect(list.id).toBeDefined();

      const lists = await alice.listNamedLists();
      expect(lists.map((item) => item.name)).toContain('Groceries');
    });

    it('rejects a list with no name', async () => {
      await expect(alice.createNamedList('')).rejects.toThrow(ValidationError);
    });

    it('rejects a second list with the same name ignoring case', async () => {
      await alice.createNamedList('Groceries');

      await expect(alice.createNamedList('Groceries')).rejects.toThrow(ConflictError);
      await expect(alice.createNamedList('groceries')).rejects.toThrow(ConflictError);

      const lists = await alice.listNamedLists();
      expect(lists.filter((list) => list.name.toLowerCase() === 'groceries')).toHaveLength(1);
    });

    it('still creates a list with a different name', async () => {
      await alice.createNamedList('Groceries');
      const weekend = await alice.createNamedList('Weekend');

      expect(weekend.name).toBe('Weekend');
      const lists = await alice.listNamedLists();
      expect(lists.map((list) => list.name)).toEqual(
        expect.arrayContaining(['Groceries', 'Weekend'])
      );
    });

    it('requires authentication to create a list', async () => {
      await expect(anonymous.createNamedList('Nope')).rejects.toThrow(UnauthorizedError);
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Creating named lists — API [${ctx.driverName}]`, () => {
    it('lets an agent token create a named list in the same organization', async () => {
      const alice = await ctx.createActor('alice-create-list-agent@example.com');
      const minted = await alice.mintAgent('List writer');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      const list = await bot.createNamedList('Bot board');

      expect(list.name).toBe('Bot board');
      expect(list.createdById).toBe(minted.agent.userId);

      const aliceLists = await alice.listNamedLists();
      expect(aliceLists.map((item) => item.name)).toContain('Bot board');
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Creating named lists on the board [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-create-list-board@example.com');
    });

    it('shows the new list in All’s pile dropdown after creating', async () => {
      await alice.createNamedList('Weekend');

      await alice.shouldSeeNamedList('Weekend');
    });
  });
});
