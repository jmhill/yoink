import { usingDrivers, describe, it, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

/**
 * Story 1 of 6: All has two modes.
 *
 * On Tasks All, a member can switch between (1) every pile at once,
 * grouped by list, no reorder, and (2) one pile (a named list, or
 * unlisted), where they can change that pile’s open order.
 *
 * Product lock: Lists is a dimension of the task board, not a second app.
 * This story only changes All. Today, Upcoming, Mine, Done, and the Lists
 * nav stay as they are. Pin still displays; overview is not ranked by
 * openOrder.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`All has two modes [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-all-two-modes@example.com');
    });

    it('groups overview by named list and unlisted, without reorder', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id });
      const notes = await alice.createTask({ title: 'Notes' });
      const errand = await alice.createTask({ title: 'Errand' });
      await alice.reorderUnlistedOpenTasks([notes.id, errand.id]);

      await alice.openAllOverview();
      await alice.shouldSeeAllPileGroups(['Groceries', 'Unlisted']);
      await alice.shouldSeeTasksInAllPileGroup('Groceries', ['Milk']);
      await alice.shouldSeeTasksInAllPileGroup('Unlisted', ['Errand', 'Notes']);
      await alice.shouldNotSeeReorderControls();
      await alice.shouldSeePinControls();
    });

    it('reorders a named list pile on All and keeps the order after refresh', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id });
      await alice.createTask({ title: 'Eggs', listId: list.id });
      await alice.createTask({ title: 'Bread', listId: list.id });

      await alice.openAllNamedPile('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs', 'Bread']);

      await alice.moveOpenTask('Milk', 'down');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk', 'Bread']);

      await alice.refreshOpenList();
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk', 'Bread']);
    });

    it('reorders the unlisted pile on All and keeps the order after refresh', async () => {
      await alice.createTask({ title: 'Notes' });
      await alice.createTask({ title: 'Errand' });
      await alice.createTask({ title: 'Call' });

      await alice.openAllUnlistedPile();
      await alice.shouldSeeOpenTasksInOrder(['Notes', 'Errand', 'Call']);

      await alice.moveOpenTask('Notes', 'down');
      await alice.shouldSeeOpenTasksInOrder(['Errand', 'Notes', 'Call']);

      await alice.refreshOpenList();
      await alice.shouldSeeOpenTasksInOrder(['Errand', 'Notes', 'Call']);
    });

    it('hides reorder when switching back to overview', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id });
      await alice.createTask({ title: 'Notes' });

      await alice.openAllNamedPile('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await alice.openAllOverview();
      await alice.shouldSeeAllPileGroups(['Groceries', 'Unlisted']);
      await alice.shouldNotSeeReorderControls();
    });

    it('leaves Today, Upcoming, Mine, and the Lists nav as they are', async () => {
      await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Notes' });

      await alice.shouldSeeTaskFilterWithoutAllPile('today');
      await alice.shouldSeeTaskFilterWithoutAllPile('upcoming');
      await alice.shouldSeeTaskFilterWithoutAllPile('mine');
      await alice.shouldSeeListsNav();
      await alice.shouldSeeNamedList('Groceries');
    });
  });
});
