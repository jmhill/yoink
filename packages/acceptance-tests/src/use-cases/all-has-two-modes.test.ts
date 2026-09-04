import { usingDrivers, describe, it, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

/**
 * Story 1 of 6: All had two modes. Story 7 retired All.
 *
 * Named-list and Unlisted pile screens still reorder. All is not a
 * destination — no overview, no dropdown. Today, Upcoming, and Mine stay.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`All has two modes [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-all-two-modes@example.com');
    });

    it('does not keep All as a grouped overview destination', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id });
      await alice.createTask({ title: 'Notes' });

      await alice.openOldAllUrl('/tasks?filter=all');
      await alice.shouldBeOnToday();
      await alice.shouldNotSeeAllDestination();
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

    it('hides reorder when leaving a pile for Today', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id });
      await alice.createTask({ title: 'Notes' });

      await alice.openAllNamedPile('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await alice.openToday();
      await alice.shouldBeOnToday();
      await alice.shouldNotSeeReorderControls();
    });

    it('leaves Today, Upcoming, and Mine as they are, with no Lists nav', async () => {
      await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Notes' });

      await alice.shouldSeeTaskFilterWithoutAllPile('today');
      await alice.shouldSeeTaskFilterWithoutAllPile('upcoming');
      await alice.shouldSeeTaskFilterWithoutAllPile('mine');
      await alice.shouldNotSeeListsNav();
      await alice.shouldSeeNamedList('Groceries');
    });
  });
});
