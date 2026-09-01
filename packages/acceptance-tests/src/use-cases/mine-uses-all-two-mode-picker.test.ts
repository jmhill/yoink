import { usingDrivers, describe, it, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

/**
 * Story 5 of 6: Mine uses All’s two-mode picker, only my tasks, and still
 * cannot reorder.
 *
 * Mine gets the same two-mode picker as All: All lists (grouped overview)
 * vs a named list vs Unlisted. Mine is still the assignee filter: only
 * tasks assigned to the current member. Even in one-pile modes, no
 * up/down. `openOrder` stays one shared sequence per pile (owned by
 * All’s one-pile views), not a Mine-specific rank. Empty groups wait:
 * only piles that have MY tasks. Pin stays on the existing Mine filter
 * sort (pinned_at then created_at). HTTP still only maps.
 *
 * Create/delete a named list stay on All. Today/Upcoming stay as just
 * shipped. All two-modes stays. Done stays. The Lists nav is gone (story 6).
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Mine uses All’s two-mode picker [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-mine-two-modes@example.com');
    });

    it('groups Mine overview by named list then Unlisted, only my tasks, with no reorder', async () => {
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
      await alice.shouldSeeMinePileDropdown();
      await alice.shouldSeePileGroups(['Groceries', 'Unlisted']);
      await alice.shouldSeeTasksInPileGroup('Groceries', ['Eggs', 'Milk']);
      await alice.shouldSeeTasksInPileGroup('Unlisted', ['Notes']);
      await alice.shouldNotSeeReorderControls();
      await alice.shouldSeePinControls();
    });

    it('shows only my tasks on a named list pile, with no up/down', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const minted = await alice.mintAgent('Mine named-pile bot');

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

      await alice.openMineNamedPile('Groceries');
      await alice.shouldSeeTaskTitles(['Eggs', 'Milk']);
      await alice.shouldNotSeeTask(botMilk.id);
      await alice.shouldNotSeeReorderControls();
    });

    it('shows only my unlisted tasks, with no up/down', async () => {
      const groceries = await alice.createNamedList('Groceries');
      const minted = await alice.mintAgent('Mine unlisted-pile bot');

      const listed = await alice.createTask({
        title: 'Milk',
        assigneeId: alice.userId,
      });
      await alice.updateTask(listed.id, { listId: groceries.id });
      await alice.createTask({ title: 'Notes', assigneeId: alice.userId });
      await alice.createTask({ title: 'Errand', assigneeId: alice.userId });
      await alice.createTask({
        title: 'Bot notes',
        assigneeId: minted.agent.userId,
      });

      await alice.openMineUnlistedPile();
      await alice.shouldSeeTaskTitles(['Errand', 'Notes']);
      await alice.shouldNotSeeReorderControls();
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

      await alice.openMineNamedPile('Groceries');
      await alice.shouldSeeTaskTitles(['My milk']);
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

    it('leaves Today, Upcoming, and Done as they are, with no Lists nav and no create or delete list on Mine', async () => {
      await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Notes' });

      await alice.shouldSeeTaskFilterWithoutAllPile('today');
      await alice.shouldSeeTaskFilterWithoutAllPile('upcoming');
      await alice.shouldSeeTaskFilterWithoutAllPile('completed');
      await alice.shouldNotSeeListsNav();
      await alice.shouldSeeNamedList('Groceries');

      await alice.openMineOverview();
      await alice.shouldSeeMinePileDropdown();
      await alice.shouldNotSeeCreateListOnMine();
      await alice.openMineNamedPile('Groceries');
      await alice.shouldNotSeeDeleteListOnMine('Groceries');
    });
  });
});
