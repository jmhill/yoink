import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError, UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #93: named-list ⋯ on the desktop always-visible sidebar must open
 * a usable Delete menu.
 *
 * After #87 / PR 91, mobile Tasks drawer ⋯ works. Desktop / large-screen
 * sidebar ⋯ still read as broken (no usable Delete). Kit DropdownMenu
 * shared z-50 with the rail and leftover Vaul chrome, and the rail’s
 * overflow clip / stacking could hide or swallow the menu.
 *
 * Delete rules are unchanged: refuse if open tasks; completed unlist;
 * land on Today if you were on that pile. No new overflow actions.
 * Mobile drawer behavior from #87 must not regress.
 *
 * Out of scope: #94 sidebar width / list-name wrap, #88 Edit, #90 drag.
 */

const railWith = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list'];

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Named-list overflow on the desktop sidebar [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-17-overflow-desktop-sidebar@example.com');
    });

    it('opens the named-list Delete menu above other chrome on a wide layout', async () => {
      await alice.createNamedList('Groceries');

      await alice.useDesktopViewport();
      await alice.openToday();
      await alice.shouldSeeDesktopAppRail();
      await alice.shouldSeeNamedListOverflowOnDesktopSidebar('Groceries');
    }, 60_000);

    it('deletes from that menu with refuse-if-open, unlist-completed, and Today-landing', async () => {
      const weekend = await alice.createNamedList('Weekend');
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      const chores = await alice.createNamedList('Chores');
      const laundry = await alice.createTask({ title: 'Laundry', listId: chores.id });
      await alice.completeTask(laundry.id);

      await alice.useDesktopViewport();
      await alice.openRailNamedList('Weekend');
      await alice.shouldBeOnAllNamedPile(weekend.id);

      await alice.deleteNamedListFromRail('Weekend');
      await alice.shouldBeOnToday();
      await alice.shouldSeeRailItems(railWith('Chores', 'Groceries'));

      await expect(alice.deleteNamedListFromRail('Groceries')).rejects.toThrow(ConflictError);
      await alice.shouldSeeRailItems(railWith('Chores', 'Groceries'));

      await alice.deleteNamedListFromRail('Chores');
      await alice.shouldSeeRailItems(railWith('Groceries'));
      await alice.openRailSmartView('done');
      await alice.shouldSeeTaskTitles(['Laundry']);
      await alice.shouldNotSeeListOnVisibleTask(laundry.id);
    }, 60_000);

    it('navigates from the list name and does not navigate from the overflow', async () => {
      const groceries = await alice.createNamedList('Groceries');

      await alice.useDesktopViewport();
      await alice.openToday();
      await alice.shouldBeOnToday();
      await alice.shouldSeeDesktopAppRail();

      await alice.shouldNotNavigateWhenOpeningNamedListOverflow('Groceries');
      await alice.shouldBeOnToday();
      await alice.shouldSeeDesktopAppRail();

      await alice.openRailNamedList('Groceries');
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldSeeDesktopAppRail();
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Named-list overflow on the desktop sidebar — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs desktop overflow stacking operations as browser-only', async () => {
      const alice = await ctx.createActor(
        'alice-ui-story-17-overflow-desktop-sidebar-http@example.com'
      );
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeNamedListOverflowOnDesktopSidebar('Groceries')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
