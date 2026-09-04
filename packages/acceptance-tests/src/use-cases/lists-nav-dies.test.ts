import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError } from '@yoink/acceptance-testing';

/**
 * Story 6 of 6: Lists nav dies.
 *
 * Lists is a dimension of the task board, not a second app. There is no
 * Lists nav and no Lists pages. Old `/lists` lands on Today (All is
 * retired). Named-list and Unlisted Lists URLs land on those pile screens.
 */

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Lists nav dies [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-lists-nav-dies@example.com');
    });

    it('has no Lists item in the nav', async () => {
      await alice.openToday();
      await alice.shouldNotSeeListsNav();
    });

    it('opens /lists on Today, not All', async () => {
      await alice.openListsUrl();
      await alice.shouldBeOnToday();
      await alice.shouldNotSeeAllDestination();
      await alice.shouldNotSeeListsNav();
    });

    it('opens a named-list Lists URL on that pile screen', async () => {
      const list = await alice.createNamedList('Groceries');

      await alice.openNamedListUrl(list.id);
      await alice.shouldBeOnAllNamedPile(list.id);
      await alice.shouldSeeEmptyNamedPile();
      await alice.shouldSeeNamedPileOnAll('Groceries');
    });

    it('opens /lists/unlisted on the Unlisted pile screen', async () => {
      await alice.createTask({ title: 'Notes' });

      await alice.openUnlistedListUrl();
      await alice.shouldBeOnAllUnlistedPile();
      await alice.shouldSeeOpenTasksInOrder(['Notes']);
    });

    it('keeps named-list create, delete, and one-pile reorder on the rail', async () => {
      await alice.createTask({ title: 'Notes' });

      const list = await alice.createNamedListFromRail('Weekend');
      await alice.shouldBeOnAllNamedPile(list.id);
      await alice.shouldSeeEmptyNamedPile();
      await alice.shouldSeeNamedPileOnAll('Weekend');

      await alice.deleteNamedListFromRail('Weekend');
      await alice.shouldBeOnToday();
      await alice.shouldNotSeeNamedPileOnAll('Weekend');

      const groceries = await alice.createNamedListFromRail('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({ title: 'Eggs', listId: groceries.id });
      await alice.openAllNamedPile('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs']);
      await alice.shouldSeeReorderControls();
      await alice.moveOpenTask('Milk', 'down');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk']);
      await expect(alice.deleteNamedListFromRail('Groceries')).rejects.toThrow(ConflictError);
      await alice.shouldBeOnAllNamedPile(groceries.id);
    }, 60_000);

    it('keeps Mine as a smart view that cannot reorder, create, or delete lists', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id, assigneeId: alice.userId });
      await alice.createTask({ title: 'Notes', assigneeId: alice.userId });

      await alice.openMineOverview();
      await alice.shouldNotSeeMinePileDropdown();
      await alice.shouldNotSeeCreateListOnMine();
      await alice.shouldNotSeeReorderControls();
      await alice.shouldNotSeeDeleteListOnMine('Groceries');
    });

    it('leaves Today, Upcoming, and Done as they are', async () => {
      await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Notes' });

      await alice.shouldSeeTaskFilterWithoutAllPile('today');
      await alice.shouldSeeTaskFilterWithoutAllPile('upcoming');
      await alice.shouldSeeTaskFilterWithoutAllPile('completed');
      await alice.shouldNotSeeListsNav();
    });
  });
});
