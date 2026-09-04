import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError } from '@yoink/acceptance-testing';

/**
 * Story 3 of 6: Delete a named list from All.
 *
 * All is retired (story 7). Delete lives on the rail overflow. After a
 * successful delete of the list you are looking at, land on Today.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Deleting a named list from All [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-delete-list-from-all@example.com');
    });

    it('deletes an empty named list from the rail and lands on Today', async () => {
      const list = await alice.createNamedList('Weekend');

      await alice.openAllNamedPile('Weekend');
      await alice.deleteNamedListFromRail('Weekend');

      await alice.shouldBeOnToday();
      await alice.shouldNotSeeNamedPileOnAll('Weekend');
      expect(list.name).toBe('Weekend');
    });

    it('refuses delete when an open task is on the list and stays on that pile', async () => {
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Milk' });
      await alice.updateTask(task.id, { listId: list.id });

      await alice.openAllNamedPile('Groceries');
      await expect(alice.deleteNamedListFromRail('Groceries')).rejects.toThrow(ConflictError);

      await alice.shouldBeOnAllNamedPile(list.id);
      await alice.shouldSeeNamedPileOnAll('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk']);
    });

    it('has no All delete-list control on Today or Unlisted', async () => {
      await alice.createNamedList('Weekend');
      await alice.createTask({ title: 'Notes' });

      await alice.openToday();
      await alice.shouldNotSeeDeleteListOnAll('Weekend');
      await alice.shouldNotSeeAllDestination();

      await alice.openAllUnlistedPile();
      await alice.shouldNotSeeDeleteListOnAll('Weekend');
    });

    it('leaves Today, Upcoming, Mine, and Done as they are, with no Lists nav', async () => {
      await alice.createNamedList('Weekend');

      await alice.shouldSeeTaskFilterWithoutAllPile('today');
      await alice.shouldSeeTaskFilterWithoutAllPile('upcoming');
      await alice.shouldSeeTaskFilterWithoutAllPile('mine');
      await alice.shouldSeeTaskFilterWithoutAllPile('completed');
      await alice.shouldNotSeeListsNav();
      await alice.shouldSeeNamedList('Weekend');
    });
  });
});
