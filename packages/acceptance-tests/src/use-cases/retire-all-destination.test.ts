import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError, UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Yoink UI story 7: retire All and its dropdown.
 *
 * All is gone as a destination. Old All URLs land on Today. Deleting the
 * named list you are looking at lands on Today. Create-list, create-task,
 * and delete already have homes on the rail and pile/smart-view screens.
 *
 * Named-list / Unlisted / Today / Upcoming / Mine / Done / Inbox / Promote
 * stay. Out of scope: mobile rail-inside-Tasks, drag, empty groups, bulk
 * actions, Done-by-list, Today/Upcoming nesting, Inbox / Promote changes.
 */

const railWith = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list'];

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Retire All [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-7-retire-all@example.com');
    });

    it('is not a destination: no All rail row, filter, or pile dropdown', async () => {
      await alice.createNamedList('Groceries');

      await alice.openRailSmartView('today');
      await alice.shouldNotSeeAllDestination();
      await alice.shouldSeeRailItems(railWith('Groceries'));

      await alice.openRailNamedList('Groceries');
      await alice.shouldNotSeeAllDestination();
    });

    it('opens old All URLs on Today, not a vanished overview', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Notes' });

      await alice.openOldAllUrl('/tasks');
      await alice.shouldBeOnToday();
      await alice.shouldNotSeeAllDestination();

      await alice.openOldAllUrl('/tasks?filter=all');
      await alice.shouldBeOnToday();

      await alice.openOldAllUrl(`/tasks?filter=all&pile=${list.id}`);
      await alice.shouldBeOnToday();

      await alice.openOldAllUrl('/tasks?filter=all&pile=unlisted');
      await alice.shouldBeOnToday();
    });

    it('lands on Today after deleting the named list you are looking at', async () => {
      await alice.createNamedList('Weekend');
      await alice.createNamedList('Groceries');

      await alice.openRailNamedList('Weekend');
      await alice.deleteNamedListFromRail('Weekend');
      await alice.shouldBeOnToday();
      await alice.shouldNotSeeAllDestination();
      await alice.shouldSeeRailItems(railWith('Groceries'));

      await alice.openRailSmartView('today');
      await alice.deleteNamedListFromRail('Groceries');
      await alice.shouldBeOnToday();
      await alice.shouldSeeRailItems(railWith());
    }, 60_000);

    it('keeps named-list, Unlisted, smart views, New list, rail-delete, Inbox, and Promote', async () => {
      const groceries = await alice.createNamedListFromRail('Groceries');
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldSeeEmptyNamedPile();
      await alice.shouldSeeAddTaskField();
      await alice.shouldNotSeeCreateTaskListPicker();

      await alice.addTaskOnCurrentView('Milk');
      await alice.addTaskOnCurrentView('Eggs');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs']);
      await alice.shouldSeeReorderControls();
      await alice.moveOpenTask('Milk', 'down');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk']);

      await alice.openRailUnlisted();
      await alice.shouldBeOnAllUnlistedPile();
      await alice.shouldSeeAddTaskField();
      await alice.shouldNotSeeCreateTaskListPicker();

      await alice.openRailSmartView('today');
      await alice.shouldBeOnToday();
      await alice.shouldSeeCreateTaskListPicker();
      await alice.shouldNotSeeReorderControls();

      await alice.openRailSmartView('upcoming');
      await alice.shouldBeOnTaskFilter('upcoming');
      await alice.shouldSeeCreateTaskListPicker();

      await alice.openRailSmartView('mine');
      await alice.shouldBeOnMineOverview();
      await alice.shouldSeeCreateTaskListPicker();

      await alice.openRailSmartView('done');
      await alice.shouldBeOnTaskFilter('completed');
      await alice.shouldNotSeeAddTaskField();

      const weekend = await alice.createNamedListFromRail('Weekend');
      await alice.shouldBeOnAllNamedPile(weekend.id);
      await alice.shouldSeeRailItems(railWith('Groceries', 'Weekend'));

      await alice.deleteNamedListFromRail('Weekend');
      await alice.shouldBeOnToday();
      await alice.shouldSeeRailItems(railWith('Groceries'));

      await expect(alice.deleteNamedListFromRail('Groceries')).rejects.toThrow(ConflictError);
      await alice.shouldSeeRailItems(railWith('Groceries'));

      await alice.createCapture({ content: 'Promote me' });
      await alice.openRailInbox();
      await alice.shouldBeOnInboxPane();
      await alice.openPromoteSheet('Promote me');
      await alice.shouldSeePromoteSheet();
      await alice.cancelPromoteSheet();
      await alice.shouldSeeCaptureOnCurrentPane('Promote me');
    }, 60_000);

    it('creates a task from a pile screen and a smart view without All', async () => {
      const list = await alice.createNamedList('Groceries');

      await alice.openRailNamedList('Groceries');
      await alice.shouldNotSeeCreateTaskListPicker();
      const onList = await alice.addTaskOnCurrentView('Milk');
      expect(onList.listId).toBe(list.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await alice.openRailUnlisted();
      await alice.shouldNotSeeCreateTaskListPicker();
      const unlisted = await alice.addTaskOnCurrentView('Notes');
      expect(unlisted.listId).toBeUndefined();
      await alice.shouldSeeOpenTasksInOrder(['Notes']);

      await alice.openRailSmartView('today');
      await alice.shouldSeeCreateTaskListPicker();
      const todayTask = await alice.addTaskOnCurrentView('Today note');
      expect(todayTask.dueDate).toBe(isoDateOffset(0));
      await alice.shouldNotSeeAllDestination();
    }, 60_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Retire All — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs All-retirement operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-7-retire-all-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldNotSeeAllDestination()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.openOldAllUrl('/tasks?filter=all')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldBeOnToday()).rejects.toThrow(UnsupportedOperationError);
    });
  });
});
