import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError } from '@yoink/acceptance-testing';

/**
 * Yoink UI story 6: Mine leftovers — lose the pile dropdown.
 *
 * Mine is a smart view: your assigned open tasks only, grouped by
 * named list then Unlisted. No one-pile mode, no reorder, no create
 * or delete on Mine. Old `?filter=mine&pile=…` URLs land on the
 * overview. All keeps its dropdown until story 7.
 */

const railWith = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list'];

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Mine leftovers [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-6-mine@example.com');
    });

    it('has no pile dropdown on Mine', async () => {
      await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Notes', assigneeId: alice.userId });

      await alice.openMineOverview();
      await alice.shouldBeOnMineOverview();
      await alice.shouldNotSeeMinePileDropdown();
      await alice.shouldNotSeeCreateListOnMine();
    });

    it('shows only my tasks grouped by list, including Unlisted, with no reorder', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const weekend = await alice.createNamedList('Weekend');
      const minted = await alice.mintAgent('Mine leftovers bot');

      const milk = await alice.createTask({
        title: 'Milk',
        assigneeId: alice.userId,
      });
      await alice.updateTask(milk.id, { listId: groceries.id });
      const eggs = await alice.createTask({
        title: 'Eggs',
        assigneeId: alice.userId,
      });
      await alice.updateTask(eggs.id, { listId: groceries.id });
      await alice.createTask({ title: 'Notes', assigneeId: alice.userId });

      const botMilk = await alice.createTask({
        title: 'Bot milk',
        assigneeId: minted.agent.userId,
      });
      await alice.updateTask(botMilk.id, { listId: groceries.id });
      const weekendOnlyTheirs = await alice.createTask({
        title: 'Bot weekend',
        assigneeId: minted.agent.userId,
      });
      await alice.updateTask(weekendOnlyTheirs.id, { listId: weekend.id });
      await alice.createTask({
        title: 'Bot notes',
        assigneeId: minted.agent.userId,
      });

      await alice.openMineOverview();
      await alice.shouldNotSeeMinePileDropdown();
      await alice.shouldSeePileGroups(['Groceries', 'Unlisted']);
      await alice.shouldSeeTasksInPileGroup('Groceries', ['Eggs', 'Milk']);
      await alice.shouldSeeTasksInPileGroup('Unlisted', ['Notes']);
      await alice.shouldNotSeeTask(botMilk.id);
      await alice.shouldNotSeeTask(weekendOnlyTheirs.id);
      await alice.shouldNotSeeReorderControls();
      await alice.shouldSeePinControls();
    });

    it('opens Mine from the rail onto that smart view and highlights Mine', async () => {
      const list = await alice.createNamedList('Groceries');
      const mineMilk = await alice.createTask({
        title: 'Mine milk',
        assigneeId: alice.userId,
      });
      await alice.updateTask(mineMilk.id, { listId: list.id });
      const other = await alice.createTask({ title: 'Unassigned notes' });

      await alice.openRailSmartView('mine');
      await alice.shouldBeOnMineOverview();
      await alice.shouldSeeRailMineHighlighted();
      await alice.shouldSeePileGroups(['Groceries']);
      await alice.shouldSeeTasksInPileGroup('Groceries', ['Mine milk']);
      await alice.shouldNotSeeTask(other.id);
      await alice.shouldNotSeeReorderControls();
    });

    it('opens an old Mine pile URL on the Mine overview with no pile UI', async () => {
      const list = await alice.createNamedList('Groceries');
      const milk = await alice.createTask({
        title: 'Milk',
        assigneeId: alice.userId,
      });
      await alice.updateTask(milk.id, { listId: list.id });
      await alice.createTask({ title: 'Notes', assigneeId: alice.userId });

      await alice.openOldMinePileUrl(list.id);
      await alice.shouldBeOnMineOverview();
      await alice.shouldNotSeeMinePileDropdown();
      await alice.shouldSeeRailMineHighlighted();
      await alice.shouldSeePileGroups(['Groceries', 'Unlisted']);
      await alice.shouldSeeTasksInPileGroup('Groceries', ['Milk']);
      await alice.shouldSeeTasksInPileGroup('Unlisted', ['Notes']);

      await alice.openOldMinePileUrl('unlisted');
      await alice.shouldBeOnMineOverview();
      await alice.shouldNotSeeMinePileDropdown();
      await alice.shouldSeePileGroups(['Groceries', 'Unlisted']);
    });

    it('leaves All two-modes with its pile dropdown and one-pile reorder', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id });
      await alice.createTask({ title: 'Eggs', listId: list.id });

      await alice.openAllOverview();
      await alice.shouldSeeAllPileDropdown();
      await alice.shouldSeeAllPileGroups(['Groceries']);

      await alice.openAllNamedPile('Groceries');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs']);
      await alice.shouldSeeReorderControls();
      await alice.moveOpenTask('Milk', 'down');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk']);
    });

    it('leaves Today, Upcoming, named-list screens, New list, and rail-delete working', async () => {
      const tomorrow = isoDateOffset(1);
      const groceries = await alice.createNamedList('Groceries');
      const todayMilk = await alice.createTask({
        title: 'Today milk',
        dueDate: isoDateOffset(0),
      });
      await alice.updateTask(todayMilk.id, { listId: groceries.id });
      const futureMilk = await alice.createTask({
        title: 'Future milk',
        dueDate: tomorrow,
      });
      await alice.updateTask(futureMilk.id, { listId: groceries.id });
      await alice.createTask({ title: 'Notes' });

      await alice.shouldSeeTaskFilterWithoutAllPile('today');
      await alice.shouldNotSeeReorderControls();

      await alice.shouldSeeTaskFilterWithoutAllPile('upcoming');
      await alice.shouldSeePileGroups(['Groceries']);
      await alice.shouldSeeTasksInPileGroup('Groceries', ['Future milk']);

      await alice.openRailNamedList('Groceries');
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldSeeAddTaskField();
      await alice.shouldSeeReorderControls();

      const weekend = await alice.createNamedListFromRail('Weekend');
      await alice.shouldBeOnAllNamedPile(weekend.id);
      await alice.shouldSeeRailItems(railWith('Groceries', 'Weekend'));

      await alice.deleteNamedListFromRail('Weekend');
      await alice.shouldSeeRailItems(railWith('Groceries'));

      await expect(alice.deleteNamedListFromRail('Groceries')).rejects.toThrow(ConflictError);
      await alice.shouldSeeRailItems(railWith('Groceries'));
    });
  });
});
