import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError } from '@yoink/acceptance-testing';

/**
 * Story 3 of 6: Delete a named list from All.
 *
 * On Tasks All, when a member is looking at one named list, they can
 * delete that list. They cannot delete from the grouped overview or
 * from Unlisted. Same refuse-if-open-tasks already shipped. After a
 * successful delete, All lands back on overview.
 *
 * This is not grouping Today/Upcoming, Mine picker, or removing the
 * Lists nav. Lists page delete stays until story 6.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Deleting a named list from All [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-delete-list-from-all@example.com');
    });

    it('deletes an empty named list from All and lands on overview', async () => {
      const list = await alice.createNamedList('Weekend');

      await alice.openAllNamedPile('Weekend');
      await alice.deleteNamedListFromAll('Weekend');

      await alice.shouldBeOnAllOverview();
      await alice.shouldNotSeeNamedPileOnAll('Weekend');
      expect(list.name).toBe('Weekend');
    });

    it('refuses delete when an open task is on the list and stays on that pile', async () => {
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Milk' });
      await alice.updateTask(task.id, { listId: list.id });

      await alice.openAllNamedPile('Groceries');
      await expect(alice.deleteNamedListFromAll('Groceries')).rejects.toThrow(ConflictError);

      await alice.shouldBeOnAllNamedPile(list.id);
      await alice.shouldSeeNamedPileOnAll('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk']);
    });

    it('has no delete-list control on overview or Unlisted', async () => {
      await alice.createNamedList('Weekend');
      await alice.createTask({ title: 'Notes' });

      await alice.openAllOverview();
      await alice.shouldNotSeeDeleteListOnAll('Weekend');

      await alice.openAllUnlistedPile();
      await alice.shouldNotSeeDeleteListOnAll('Weekend');
    });

    it('leaves Today, Upcoming, Mine, Done, and the Lists nav as they are', async () => {
      await alice.createNamedList('Weekend');

      await alice.shouldSeeTaskFilterWithoutAllPile('today');
      await alice.shouldSeeTaskFilterWithoutAllPile('upcoming');
      await alice.shouldSeeTaskFilterWithoutAllPile('mine');
      await alice.shouldSeeTaskFilterWithoutAllPile('completed');
      await alice.shouldSeeListsNav();
      await alice.shouldSeeNamedList('Weekend');
    });
  });
});
