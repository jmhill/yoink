import { usingDrivers, describe, it, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

/**
 * Story 4 of 6: Today and Upcoming group by list and cannot reorder.
 *
 * Today and Upcoming are grouped overviews. Open tasks are grouped by
 * named list (plus unlisted). You cannot change pile order there.
 *
 * Product lock (Polly): list groups are outer. Today still splits overdue
 * vs due today inside each list group. Upcoming has no overdue split —
 * just list groups. Pin still sits on the existing filter sort (pinned_at
 * then created_at), not openOrder. Empty groups wait: only piles with
 * tasks in that view. HTTP still only maps.
 *
 * This is not All two-modes, create/delete from All, Mine picker, or
 * removing the Lists nav.
 */

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Today and Upcoming group by list [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-today-upcoming-groups@example.com');
    });

    it('groups Today by named list and unlisted, splits overdue vs due today inside a group, and has no reorder', async () => {
      const yesterday = isoDateOffset(-1);
      const today = isoDateOffset(0);
      const list = await alice.createNamedList('Groceries');
      const overdue = await alice.createTask({ title: 'Late milk', dueDate: yesterday });
      await alice.updateTask(overdue.id, { listId: list.id });
      const dueToday = await alice.createTask({ title: 'Today milk', dueDate: today });
      await alice.updateTask(dueToday.id, { listId: list.id });
      await alice.createTask({ title: 'Unlisted today', dueDate: today });

      await alice.openToday();
      await alice.shouldSeePileGroups(['Groceries', 'Unlisted']);
      await alice.shouldSeeOverdueAndDueTodayInPileGroup(
        'Groceries',
        ['Late milk'],
        ['Today milk']
      );
      await alice.shouldSeeTasksInPileGroup('Unlisted', ['Unlisted today']);
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
