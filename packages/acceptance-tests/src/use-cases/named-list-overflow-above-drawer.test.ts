import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError, UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #87: named-list ⋯ overflow must open above the mobile Tasks drawer.
 *
 * The portaled Delete menu shared z-50 with the Vaul drawer + overlay, so
 * on the phone it stacked under the sheet (reads as “does nothing”).
 * Desktop sidebar has no parent drawer layer and must keep working.
 *
 * Delete rules are unchanged: refuse if open tasks; completed unlist;
 * land on Today if you were on that pile. No new overflow actions.
 *
 * Out of scope: #84 alignment, #85 URL links, #88 edit control,
 * #90 multi-slot drag, multi-select, new list actions beyond Delete.
 */

const railWith = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list'];

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Named-list overflow above the mobile drawer [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-15-overflow-above-drawer@example.com');
    });

    it('opens the named-list Delete menu on top of the mobile Tasks drawer', async () => {
      await alice.createNamedList('Groceries');

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openMobileTasksRail();
      await alice.shouldSeeMobileTasksRail();
      await alice.shouldSeeNamedListOverflowAboveMobileDrawer('Groceries');
    });

    it('deletes from that menu with refuse-if-open, unlist-completed, and Today-landing', async () => {
      const weekend = await alice.createNamedList('Weekend');
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      const chores = await alice.createNamedList('Chores');
      const laundry = await alice.createTask({ title: 'Laundry', listId: chores.id });
      await alice.completeTask(laundry.id);

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.openRailNamedList('Weekend');
      await alice.shouldBeOnAllNamedPile(weekend.id);

      await alice.deleteNamedListFromRail('Weekend');
      await alice.shouldBeOnToday();
      await alice.shouldSeeRailItems(railWith('Groceries', 'Chores'));

      await expect(alice.deleteNamedListFromRail('Groceries')).rejects.toThrow(ConflictError);
      await alice.shouldSeeRailItems(railWith('Groceries', 'Chores'));

      await alice.deleteNamedListFromRail('Chores');
      await alice.shouldSeeRailItems(railWith('Groceries'));
      await alice.openRailSmartView('done');
      await alice.shouldSeeTaskTitles(['Laundry']);
      await alice.shouldNotSeeListOnVisibleTask(laundry.id);
    }, 60_000);

    it('navigates from the list name and does not navigate from the overflow', async () => {
      const groceries = await alice.createNamedList('Groceries');

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.shouldBeOnToday();

      await alice.openMobileTasksRail();
      await alice.shouldNotNavigateWhenOpeningNamedListOverflow('Groceries');
      await alice.shouldBeOnToday();
      await alice.shouldSeeMobileTasksRail();

      await alice.openRailNamedList('Groceries');
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldNotSeeMobileTasksRail();
    });
  });

  describe(`Named-list overflow on the desktop sidebar [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-15-overflow-desktop@example.com');
    });

    it('still opens named-list overflow and Delete on a wide layout', async () => {
      await alice.createNamedList('Weekend');
      await alice.useDesktopViewport();

      await alice.openToday();
      await alice.shouldSeeDesktopAppRail();
      await alice.shouldSeeNamedListOverflowOnRail('Weekend');

      await alice.deleteNamedListFromRail('Weekend');
      await alice.shouldBeOnToday();
      await alice.shouldSeeRailItems(railWith());
    }, 60_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Named-list overflow above the drawer — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs overflow stacking operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-15-overflow-above-drawer-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeNamedListOverflowAboveMobileDrawer('Groceries')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldNotNavigateWhenOpeningNamedListOverflow('Groceries')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
