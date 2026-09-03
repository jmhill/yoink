import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Yoink UI story 3: the list is the pile on add-task.
 *
 * On a named-list or Unlisted screen the list *is* the pile — no list
 * picker on add-task. New tasks go on that named list (existing create
 * with listId) or stay unlisted (omit listId). Today / Upcoming / Mine
 * keep the picker. All overview keeps its pile dropdown and create-task
 * list picker as fallback. Do not retire All.
 *
 * Out of scope: Inbox pane, Promote, Mine leftover, All retirement,
 * mobile redesign, drag, empty groups, bulk actions, rail delete
 * (already shipped). Create-list stays on + New list / All.
 */

const railWith = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list'];

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`List is the pile on add-task [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-3-list-is-pile@example.com');
    });

    it('hides the list picker on a named-list screen and creates onto that list', async () => {
      const list = await alice.createNamedList('Groceries');

      await alice.openRailNamedList('Groceries');
      await alice.shouldNotSeeCreateTaskListPicker();

      const task = await alice.addTaskOnCurrentView('Milk');

      expect(task.listId).toBe(list.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);
    });

    it('hides the list picker on Unlisted and creates an unlisted task', async () => {
      await alice.openRailUnlisted();
      await alice.shouldNotSeeCreateTaskListPicker();

      const task = await alice.addTaskOnCurrentView('Notes');

      expect(task.listId).toBeUndefined();
      await alice.shouldSeeOpenTasksInOrder(['Notes']);
      await alice.shouldNotSeeListOnVisibleTask(task.id);
    });

    it('keeps the list picker on Today, Upcoming, and Mine', async () => {
      await alice.createNamedList('Groceries');

      await alice.openRailSmartView('today');
      await alice.shouldSeeCreateTaskListPicker();

      await alice.openRailSmartView('upcoming');
      await alice.shouldSeeCreateTaskListPicker();

      await alice.openRailSmartView('mine');
      await alice.shouldSeeCreateTaskListPicker();
      await alice.openMineNamedPile('Groceries');
      await alice.shouldSeeCreateTaskListPicker();
    });

    it('keeps All overview pile dropdown and create-task list picker as fallback', async () => {
      const list = await alice.createNamedList('Groceries');

      await alice.openAllOverview();
      await alice.shouldSeeAllPileDropdown();
      await alice.shouldSeeCreateTaskListPicker();

      const task = await alice.createTask({ title: 'Milk', listId: list.id });
      expect(task.listId).toBe(list.id);
      await alice.shouldSeeListOnTask(task.id, 'Groceries');
      await alice.shouldSeeAllPileDropdown();
    });

    it('keeps rail overflow delete and New list', async () => {
      const created = await alice.createNamedListFromRail('Weekend');
      await alice.shouldBeOnAllNamedPile(created.id);
      await alice.shouldSeeRailItems(railWith('Weekend'));

      await alice.deleteNamedListFromRail('Weekend');
      await alice.shouldSeeRailItems(railWith());

      const again = await alice.createNamedListFromRail('Groceries');
      await alice.shouldBeOnAllNamedPile(again.id);
      await alice.shouldSeeNamedListOverflowOnRail('Groceries');
      await alice.shouldSeeRailItems(railWith('Groceries'));
    }, 60_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`List is the pile on add-task — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs add-task pile picker operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-3-list-is-pile-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeCreateTaskListPicker()).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldNotSeeCreateTaskListPicker()).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.addTaskOnCurrentView('Milk')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
