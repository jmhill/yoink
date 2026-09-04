import { usingDrivers, describe, it, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

/**
 * Mine is the assignee-only smart view: grouped by named list then
 * Unlisted, no pile dropdown, no reorder. Story 6 removed the leftover
 * All two-mode picker from Mine. All still owns one-pile reorder.
 *
 * Create/delete a named list stay off Mine. Today/Upcoming/Done stay.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Mine is the assigned-to-me smart view [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-mine-two-modes@example.com');
    });

    it('groups Mine by named list then Unlisted, only my tasks, with no dropdown or reorder', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const weekend = await alice.createNamedList('Weekend');
      const minted = await alice.mintAgent('Mine picker bot');

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

    it('does not show a task assigned to someone else, including on a list I also use', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const minted = await alice.mintAgent('Someone else bot');

      const mineOnList = await alice.createTask({
        title: 'My milk',
        assigneeId: alice.userId,
      });
      await alice.updateTask(mineOnList.id, { listId: groceries.id });
      const theirsOnList = await alice.createTask({
        title: 'Their milk',
        assigneeId: minted.agent.userId,
      });
      await alice.updateTask(theirsOnList.id, { listId: groceries.id });
      const unassignedOnList = await alice.createTask({ title: 'Unassigned milk' });
      await alice.updateTask(unassignedOnList.id, { listId: groceries.id });

      await alice.openMineOverview();
      await alice.shouldSeeTasksInPileGroup('Groceries', ['My milk']);
      await alice.shouldNotSeeTask(theirsOnList.id);
      await alice.shouldNotSeeTask(unassignedOnList.id);
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

    it('leaves Today, Upcoming, and Done as they are, with no create or delete list on Mine', async () => {
      await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Notes' });

      await alice.shouldSeeTaskFilterWithoutAllPile('today');
      await alice.shouldSeeTaskFilterWithoutAllPile('upcoming');
      await alice.shouldSeeTaskFilterWithoutAllPile('completed');
      await alice.shouldNotSeeListsNav();
      await alice.shouldSeeNamedList('Groceries');

      await alice.openMineOverview();
      await alice.shouldNotSeeMinePileDropdown();
      await alice.shouldNotSeeCreateListOnMine();
      await alice.shouldNotSeeDeleteListOnMine('Groceries');
    });
  });
});
