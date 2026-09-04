import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError } from '@yoink/acceptance-testing';

/**
 * Story 6 of 6: Lists nav dies.
 *
 * Lists is a dimension of the task board, not a second app. After this
 * story there is no Lists nav and no Lists pages. Members find and work
 * piles on Tasks. Old Lists URLs land on All so bookmarks do not 404.
 *
 * This story only removes the Lists surface. It does not add new list
 * behavior. Create/delete stay on All. Mine is still a filter. HTTP
 * still only maps.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Lists nav dies [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-lists-nav-dies@example.com');
    });

    it('has no Lists item in the nav', async () => {
      await alice.openAllOverview();
      await alice.shouldNotSeeListsNav();
    });

    it('opens /lists on Tasks All overview', async () => {
      await alice.openListsUrl();
      await alice.shouldBeOnAllOverview();
      await alice.shouldSeeAllPileDropdown();
      await alice.shouldNotSeeListsNav();
    });

    it('opens a named-list Lists URL on that list’s All one-pile', async () => {
      const list = await alice.createNamedList('Groceries');

      await alice.openNamedListUrl(list.id);
      await alice.shouldBeOnAllNamedPile(list.id);
      await alice.shouldSeeEmptyNamedPile();
      await alice.shouldSeeNamedPileOnAll('Groceries');
    });

    it('opens /lists/unlisted on All Unlisted', async () => {
      await alice.createTask({ title: 'Notes' });

      await alice.openUnlistedListUrl();
      await alice.shouldBeOnAllUnlistedPile();
      await alice.shouldSeeOpenTasksInOrder(['Notes']);
    });

    it('keeps All’s two-mode picker, create, delete-on-named-pile, and one-pile reorder', async () => {
      await alice.createTask({ title: 'Notes' });

      await alice.openAllOverview();
      await alice.shouldSeeAllPileDropdown();
      await alice.shouldSeeAllPileGroups(['Unlisted']);
      await alice.shouldNotSeeReorderControls();

      const list = await alice.createNamedListFromAll('Weekend');
      await alice.shouldBeOnAllNamedPile(list.id);
      await alice.shouldSeeEmptyNamedPile();
      await alice.shouldSeeNamedPileOnAll('Weekend');

      await alice.openAllNamedPile('Weekend');
      await alice.deleteNamedListFromAll('Weekend');
      await alice.shouldBeOnAllOverview();
      await alice.shouldNotSeeNamedPileOnAll('Weekend');

      const groceries = await alice.createNamedListFromAll('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({ title: 'Eggs', listId: groceries.id });
      await alice.openAllNamedPile('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs']);
      await alice.shouldSeeReorderControls();
      await alice.moveOpenTask('Milk', 'down');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk']);
      await expect(alice.deleteNamedListFromAll('Groceries')).rejects.toThrow(ConflictError);
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
