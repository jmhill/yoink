import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';

const pileTitles = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `Card ${String(index + 1).padStart(2, '0')}`);

const fillPile = async (actor: CoreActor, listId: string, titles: string[]): Promise<void> => {
  for (const title of titles) {
    await actor.createTask({ title, listId });
  }
};

/**
 * Issue #129: a pile of more than 50 open tasks is a complete answer,
 * in the API and on the app screen. Bots must not see a silent cutoff.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Listing complete piles [${ctx.driverName}]`, () => {
    it('returns every open task on a named list with more than 50 cards', async () => {
      const alice = await ctx.createActor('alice-pile-complete-http@example.com');
      const list = await alice.createNamedList('Big pile');
      const titles = pileTitles(51);
      await fillPile(alice, list.id, titles);

      const pile = await alice.listOpenTasksOnList(list.id);
      expect(pile.map((task) => task.title)).toEqual(titles);

      const allOpen = await alice.listTasks('all');
      expect(allOpen).toHaveLength(51);
      expect(new Set(allOpen.map((task) => task.id)).size).toBe(51);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Listing complete piles [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-pile-complete-ui@example.com');
    });

    it('shows every task on a pile of more than 50', async () => {
      const list = await alice.createNamedList('Big pile');
      const minted = await alice.mintAgent('Lane');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });
      const titles = pileTitles(51);
      await fillPile(bot, list.id, titles);

      await alice.openNamedListUrl(list.id);
      await alice.shouldSeeOpenTasksInOrder(titles);
      await alice.shouldSeeTaskPlace('Big pile', '51 open');
    }, 60_000);

    it('loads every completed title when Load more is clicked on Done', async () => {
      const minted = await alice.mintAgent('Lane');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });
      const titles = pileTitles(51);
      for (const title of titles) {
        const task = await bot.createTask({ title });
        await bot.completeTask(task.id);
      }

      await alice.openDone();
      await alice.shouldSeeLoadMore();
      await alice.clickLoadMore();
      await alice.shouldSeeEveryTaskTitle(titles);
      await alice.shouldNotSeeLoadMore();
    }, 60_000);
  });
});
