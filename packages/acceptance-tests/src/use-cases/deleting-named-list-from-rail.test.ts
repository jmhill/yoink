import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError, UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Yoink UI story 2: delete a named list from its rail-row overflow.
 *
 * Same refuse-if-open / unlist-completed command already shipped.
 * Reuses DeleteNamedListDialog. All’s named-pile delete and + New list stay.
 * Do not retire All, move create-task, or start Inbox/Promote/Mine leftover.
 */

const railWithout = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list'];

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Deleting a named list from the rail [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-2-rail-delete@example.com');
    });

    it('gives a named-list rail row an overflow with Delete, not Unlisted or smart views', async () => {
      await alice.createNamedList('Groceries');

      await alice.shouldSeeNamedListOverflowOnRail('Groceries');
      await alice.shouldNotSeeNamedListOverflowOnRail('Unlisted');
      await alice.shouldNotSeeNamedListOverflowOnRail('Inbox');
      await alice.shouldNotSeeNamedListOverflowOnRail('Today');
      await alice.shouldNotSeeNamedListOverflowOnRail('Upcoming');
      await alice.shouldNotSeeNamedListOverflowOnRail('Mine');
      await alice.shouldNotSeeNamedListOverflowOnRail('Done');
      await alice.shouldNotSeeNamedListOverflowOnRail('New list');
    });

    it('deletes an empty named list from the rail; recreating the name is a new list', async () => {
      const list = await alice.createNamedList('Weekend');

      await alice.deleteNamedListFromRail('Weekend');

      await alice.shouldSeeRailItems(railWithout());
      const again = await alice.createNamedListFromRail('Weekend');
      expect(again.id).not.toBe(list.id);
      await alice.shouldSeeRailItems(railWithout('Weekend'));
    });

    it('refuses delete when an open task is on the list and keeps the list on the rail', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id });

      await expect(alice.deleteNamedListFromRail('Groceries')).rejects.toThrow(ConflictError);

      await alice.shouldSeeRailItems(railWithout('Groceries'));
      await alice.openRailNamedList('Groceries');
      await alice.shouldBeOnAllNamedPile(list.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);
    });

    it('deletes a completed-only list; those tasks stay in Done, unlisted', async () => {
      const list = await alice.createNamedList('Groceries');
      const task = await alice.createTask({ title: 'Milk', listId: list.id });
      await alice.completeTask(task.id);

      await alice.deleteNamedListFromRail('Groceries');

      await alice.shouldSeeRailItems(railWithout());
      await alice.openRailSmartView('done');
      await alice.shouldSeeTaskTitles(['Milk']);
      await alice.shouldNotSeeListOnVisibleTask(task.id);
    });

    it('leaves the gone pile after deleting the list you were viewing, and stays on another view', async () => {
      await alice.createNamedList('Weekend');
      await alice.createNamedList('Groceries');

      await alice.openRailNamedList('Weekend');
      await alice.deleteNamedListFromRail('Weekend');
      await alice.shouldBeOnAllOverview();
      await alice.shouldSeeRailItems(railWithout('Groceries'));

      await alice.openRailSmartView('today');
      await alice.deleteNamedListFromRail('Groceries');
      await alice.shouldBeOnTaskFilter('today');
      await alice.shouldSeeRailItems(railWithout());
    });

    it('keeps All fallback delete and rail New list, without retiring All', async () => {
      await alice.createTask({ title: 'Notes' });

      const fromAll = await alice.createNamedListFromAll('Weekend');
      await alice.shouldBeOnAllNamedPile(fromAll.id);
      await alice.deleteNamedListFromAll('Weekend');
      await alice.shouldBeOnAllOverview();
      await alice.shouldNotSeeNamedPileOnAll('Weekend');
      await alice.shouldSeeAllPileDropdown();

      const fromRail = await alice.createNamedListFromRail('Groceries');
      await alice.shouldBeOnAllNamedPile(fromRail.id);
      await alice.shouldSeeEmptyNamedPile();
      await alice.shouldSeeRailItems(railWithout('Groceries'));
      await alice.shouldSeeAllPileDropdown();
    }, 60_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Deleting a named list from the rail — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs rail overflow delete as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-2-rail-delete-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeNamedListOverflowOnRail('Groceries')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldNotSeeNamedListOverflowOnRail('Unlisted')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.deleteNamedListFromRail('Groceries')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldBeOnTaskFilter('today')).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldNotSeeListOnVisibleTask('task-id')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
