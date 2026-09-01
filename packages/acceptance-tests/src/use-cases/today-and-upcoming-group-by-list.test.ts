import { usingDrivers, describe, it, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

/**
 * Story 4 of 6: Today and Upcoming group by list and cannot reorder.
 *
 * Today and Upcoming are grouped overviews. You cannot change pile order
 * there. Pin still sits on the existing filter sort (pinned_at then
 * created_at), not openOrder. Empty groups wait: only piles with tasks
 * in that view. HTTP still only maps.
 *
 * Product lock (Polly): Today is a deadline view. Outer groups are
 * overdue, then due today. Inside each, named list plus unlisted.
 * Upcoming has no overdue split — just list groups.
 *
 * This is not All two-modes, create/delete from All, or Mine picker.
 * The Lists nav is gone (story 6).
 */

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Today and Upcoming group by list [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-today-upcoming-groups@example.com');
    });

    it('groups Today as overdue then due today on the outside, list groups inside, with no reorder', async () => {
      const yesterday = isoDateOffset(-1);
      const today = isoDateOffset(0);
      const list = await alice.createNamedList('Groceries');
      const overdueListed = await alice.createTask({ title: 'Late milk', dueDate: yesterday });
      await alice.updateTask(overdueListed.id, { listId: list.id });
      await alice.createTask({ title: 'Late notes', dueDate: yesterday });
      const dueTodayListed = await alice.createTask({ title: 'Today milk', dueDate: today });
      await alice.updateTask(dueTodayListed.id, { listId: list.id });
      await alice.createTask({ title: 'Unlisted today', dueDate: today });

      await alice.openToday();
      await alice.shouldSeeTodayOuterSections(['overdue', 'due-today']);
      await alice.shouldSeePileGroupsInTodaySection('overdue', ['Groceries', 'Unlisted']);
      await alice.shouldSeeTasksInTodaySectionPileGroup('overdue', 'Groceries', ['Late milk']);
      await alice.shouldSeeTasksInTodaySectionPileGroup('overdue', 'Unlisted', ['Late notes']);
      await alice.shouldSeePileGroupsInTodaySection('due-today', ['Groceries', 'Unlisted']);
      await alice.shouldSeeTasksInTodaySectionPileGroup('due-today', 'Groceries', ['Today milk']);
      await alice.shouldSeeTasksInTodaySectionPileGroup('due-today', 'Unlisted', ['Unlisted today']);
      await alice.shouldNotSeeReorderControls();
      await alice.shouldSeePinControls();
    });

    it('groups Upcoming by named list and unlisted, with no overdue split and no reorder', async () => {
      const tomorrow = isoDateOffset(1);
      const list = await alice.createNamedList('Groceries');
      const listed = await alice.createTask({ title: 'Future milk', dueDate: tomorrow });
      await alice.updateTask(listed.id, { listId: list.id });
      await alice.createTask({ title: 'Future notes', dueDate: tomorrow });

      await alice.openUpcoming();
      await alice.shouldSeePileGroups(['Groceries', 'Unlisted']);
      await alice.shouldSeeTasksInPileGroup('Groceries', ['Future milk']);
      await alice.shouldSeeTasksInPileGroup('Unlisted', ['Future notes']);
      await alice.shouldNotSeeTodayDueSplit();
      await alice.shouldNotSeeReorderControls();
    });

    it('leaves All two-modes with its pile dropdown', async () => {
      await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Notes' });

      await alice.openAllOverview();
      await alice.shouldSeeAllPileDropdown();
      await alice.shouldSeeAllPileGroups(['Unlisted']);
    });
  });
});
