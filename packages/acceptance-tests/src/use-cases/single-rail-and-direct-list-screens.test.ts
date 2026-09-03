import { usingDrivers, describe, it, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

/**
 * Yoink UI story 1: a single rail plus direct named-list and Unlisted
 * screens. All stays as the working fallback.
 *
 * Approved rail: Inbox with a count, Today, Upcoming, Mine, Done, flat
 * named lists (no nesting), Unlisted last, + New list. Smart views and
 * lists are peers. Named list / Unlisted land on the existing one-pile
 * screens (add-task + kit up/down). Smart views keep current semantics.
 * Do not retire All, remove its dropdown, or move creation.
 *
 * Later: move create-list/create-task, Inbox pane tabs, Promote sheet,
 * mobile bottom-tab redesign, All retirement, visual polish.
 */

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Single rail and direct list screens [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-1-rail@example.com');
    });

    it('shows the rail in approved order, with an inbox count and empty named lists', async () => {
      await alice.createCapture({ content: 'Note one' });
      await alice.createCapture({ content: 'Note two' });
      await alice.createNamedList('Groceries');
      await alice.createNamedList('Weekend');

      await alice.shouldSeeRailItems([
        'Inbox',
        'Today',
        'Upcoming',
        'Mine',
        'Done',
        'Groceries',
        'Weekend',
        'Unlisted',
        'New list',
      ]);
      await alice.shouldSeeInboxCountOnRail(2);
    });

    it('opens a named list from the rail onto the existing one-pile with add-task and reorder', async () => {
      const list = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: list.id });
      await alice.createTask({ title: 'Eggs', listId: list.id });

      await alice.openRailNamedList('Groceries');
      await alice.shouldBeOnAllNamedPile(list.id);
      await alice.shouldSeeAddTaskField();
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs']);
      await alice.shouldSeeReorderControls();

      await alice.moveOpenTask('Milk', 'down');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk']);
    });

    it('opens Unlisted from the rail onto the existing one-pile with add-task and reorder', async () => {
      await alice.createTask({ title: 'Notes' });
      await alice.createTask({ title: 'Errand' });

      await alice.openRailUnlisted();
      await alice.shouldBeOnAllUnlistedPile();
      await alice.shouldSeeAddTaskField();
      await alice.shouldSeeOpenTasksInOrder(['Notes', 'Errand']);
      await alice.shouldSeeReorderControls();

      await alice.moveOpenTask('Notes', 'down');
      await alice.shouldSeeOpenTasksInOrder(['Errand', 'Notes']);
    });

    it('keeps Today, Upcoming, Mine, and Done semantics when opened from the rail', async () => {
      const yesterday = isoDateOffset(-1);
      const today = isoDateOffset(0);
      const tomorrow = isoDateOffset(1);
      const list = await alice.createNamedList('Groceries');

      const lateMilk = await alice.createTask({ title: 'Late milk', dueDate: yesterday });
      await alice.updateTask(lateMilk.id, { listId: list.id });
      await alice.createTask({ title: 'Late notes', dueDate: yesterday });
      const todayMilk = await alice.createTask({ title: 'Today milk', dueDate: today });
      await alice.updateTask(todayMilk.id, { listId: list.id });

      const futureMilk = await alice.createTask({ title: 'Future milk', dueDate: tomorrow });
      await alice.updateTask(futureMilk.id, { listId: list.id });
      await alice.createTask({ title: 'Future notes', dueDate: tomorrow });

      const mineMilk = await alice.createTask({
        title: 'Mine milk',
        assigneeId: alice.userId,
      });
      await alice.updateTask(mineMilk.id, { listId: list.id });
      await alice.createTask({ title: 'Someone else', assigneeId: undefined });
      const done = await alice.createTask({ title: 'Finished' });
      await alice.completeTask(done.id);

      await alice.openRailSmartView('today');
      await alice.shouldSeeTodayOuterSections(['overdue', 'due-today']);
      await alice.shouldSeePileGroupsInTodaySection('overdue', ['Groceries', 'Unlisted']);
      await alice.shouldSeeTasksInTodaySectionPileGroup('overdue', 'Groceries', ['Late milk']);
      await alice.shouldSeeTasksInTodaySectionPileGroup('overdue', 'Unlisted', ['Late notes']);
      await alice.shouldSeePileGroupsInTodaySection('due-today', ['Groceries']);
      await alice.shouldSeeTasksInTodaySectionPileGroup('due-today', 'Groceries', ['Today milk']);
      await alice.shouldNotSeeReorderControls();

      await alice.openRailSmartView('upcoming');
      await alice.shouldSeePileGroups(['Groceries', 'Unlisted']);
      await alice.shouldSeeTasksInPileGroup('Groceries', ['Future milk']);
      await alice.shouldSeeTasksInPileGroup('Unlisted', ['Future notes']);
      await alice.shouldNotSeeTodayDueSplit();
      await alice.shouldNotSeeReorderControls();

      await alice.openRailSmartView('mine');
      await alice.shouldSeeMinePileDropdown();
      await alice.shouldSeePileGroups(['Groceries']);
      await alice.shouldSeeTasksInPileGroup('Groceries', ['Mine milk']);
      await alice.shouldNotSeeTask(done.id);
      await alice.shouldNotSeeReorderControls();

      await alice.openRailSmartView('done');
      await alice.shouldSeeTaskTitles(['Finished']);
      await alice.shouldNotSeeAddTaskField();
      await alice.shouldNotSeeReorderControls();
    });

    it('keeps All as a working fallback with dropdown, create, and delete', async () => {
      await alice.createTask({ title: 'Notes' });

      await alice.openAllOverview();
      await alice.shouldSeeAllPileDropdown();
      await alice.shouldSeeAllPileGroups(['Unlisted']);
      await alice.shouldNotSeeReorderControls();

      const fromAll = await alice.createNamedListFromAll('Weekend');
      await alice.shouldBeOnAllNamedPile(fromAll.id);
      await alice.shouldSeeEmptyNamedPile();
      await alice.shouldSeeNamedPileOnAll('Weekend');
      await alice.shouldSeeAddTaskField();

      await alice.deleteNamedListFromAll('Weekend');
      await alice.shouldBeOnAllOverview();
      await alice.shouldNotSeeNamedPileOnAll('Weekend');
      await alice.shouldSeeAllPileDropdown();

      const fromRail = await alice.createNamedListFromRail('Groceries');
      await alice.shouldBeOnAllNamedPile(fromRail.id);
      await alice.shouldSeeEmptyNamedPile();
      await alice.shouldSeeNamedPileOnAll('Groceries');
      await alice.shouldSeeRailItems([
        'Inbox',
        'Today',
        'Upcoming',
        'Mine',
        'Done',
        'Groceries',
        'Unlisted',
        'New list',
      ]);
    });
  });
});
