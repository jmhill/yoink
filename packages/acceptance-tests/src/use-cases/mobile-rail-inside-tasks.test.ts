import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError, UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #76: mobile Tasks rail is a swipe drawer, not always-open.
 *
 * Story 8 put the flat rail inside mobile Tasks (always visible). That
 * always-open rail ate the viewport. Content owns the screen; the rail
 * swipes in like a native drawer. Desktop sidebar stays always-visible.
 *
 * Polly lock: bottom tabs stay Inbox | Tasks only. Drawer contents stay
 * the approved flat rail (smart views, Lists heading, named lists,
 * Unlisted, + New list, overflow delete). Inbox mobile behavior unchanged.
 *
 * Out of scope: drag reorder (#78), checkbox redesign (#77), swipe-to-complete
 * (#79), multi-select, changing the desktop rail.
 */

const railWith = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list'];

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Mobile Tasks rail drawer [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-9-mobile-rail-drawer@example.com');
      await alice.useMobileViewport();
    });

    it('keeps only Inbox and Tasks bottom tabs — no Lists, All, or third tab', async () => {
      await alice.openMobileBottomTab('inbox');
      await alice.shouldSeeMobileBottomTabs(['Inbox', 'Tasks']);
      await alice.shouldNotSeeMobileBottomTab('Lists');
      await alice.shouldNotSeeMobileBottomTab('All');
      await alice.shouldNotSeeMobileBottomTab('Today');
      await alice.shouldNotSeeMobileBottomTab('Upcoming');
      await alice.shouldNotSeeMobileBottomTab('Mine');
      await alice.shouldNotSeeMobileBottomTab('Done');
      await alice.shouldNotSeeMobileBottomTab('Unlisted');
      await alice.shouldNotSeeMobileBottomTab('New list');

      await alice.openMobileBottomTab('tasks');
      await alice.shouldSeeMobileBottomTabs(['Inbox', 'Tasks']);
      await alice.shouldNotSeeMobileBottomTab('Lists');
      await alice.shouldNotSeeMobileBottomTab('All');
      await alice.shouldNotSeeMobileBottomTab('Today');
      await alice.shouldNotSeeMobileBottomTab('Upcoming');
      await alice.shouldNotSeeMobileBottomTab('Mine');
      await alice.shouldNotSeeMobileBottomTab('Done');
      await alice.shouldNotSeeMobileBottomTab('Unlisted');
      await alice.shouldNotSeeMobileBottomTab('New list');
    });

    it('shows task content first — the rail does not occupy the screen by default', async () => {
      await alice.openMobileBottomTab('tasks');
      await alice.shouldSeeTasksContentWithoutMobileRail();
    });

    it('opens the drawer to the flat rail and closes it after choosing a destination', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });

      await alice.openMobileBottomTab('tasks');
      await alice.shouldNotSeeMobileTasksRail();

      await alice.openMobileTasksRail();
      await alice.shouldSeeMobileTasksRail();
      await alice.shouldSeeRailItems(railWith('Groceries'));
      await alice.shouldSeeListsHeadingAboveNamedList('Groceries');

      await alice.openRailSmartView('today');
      await alice.shouldBeOnToday();
      await alice.shouldNotSeeMobileTasksRail();

      await alice.openRailSmartView('upcoming');
      await alice.shouldBeOnTaskFilter('upcoming');
      await alice.shouldNotSeeMobileTasksRail();

      await alice.openRailSmartView('mine');
      await alice.shouldBeOnMineOverview();
      await alice.shouldNotSeeMobileTasksRail();

      await alice.openRailSmartView('done');
      await alice.shouldBeOnTaskFilter('completed');
      await alice.shouldNotSeeMobileTasksRail();

      await alice.openRailNamedList('Groceries');
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);
      await alice.shouldNotSeeMobileTasksRail();

      await alice.openRailUnlisted();
      await alice.shouldBeOnAllUnlistedPile();
      await alice.shouldNotSeeMobileTasksRail();
    }, 60_000);

    it('opens the Inbox capture pane from the mobile Inbox bottom tab', async () => {
      await alice.createCapture({ content: 'Note one' });

      await alice.openMobileBottomTab('tasks');
      await alice.openMobileBottomTab('inbox');
      await alice.shouldBeOnInboxPane();
      await alice.shouldSeeInboxPaneTabs(['Inbox', 'Snoozed', 'Trash']);
      await alice.shouldSeeCaptureOnCurrentPane('Note one');
      await alice.shouldSeeQuickAddCapture();

      await alice.openInboxPaneTab('snoozed');
      await alice.shouldBeOnInboxPaneTab('snoozed');
      await alice.shouldNotSeeQuickAddCapture();

      await alice.openInboxPaneTab('trash');
      await alice.shouldBeOnInboxPaneTab('trash');

      await alice.openInboxPaneTab('inbox');
      await alice.shouldBeOnInboxPane();
    });

    it('keeps named-list, Unlisted, smart views, New list, rail-delete, and Promote on mobile', async () => {
      const groceries = await alice.createNamedListFromRail('Groceries');
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldSeeEmptyNamedPile();
      await alice.shouldSeeAddTaskField();
      await alice.shouldNotSeeCreateTaskListPicker();
      await alice.shouldNotSeeMobileTasksRail();

      await alice.addTaskOnCurrentView('Milk');
      await alice.addTaskOnCurrentView('Eggs');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs']);
      await alice.shouldSeeReorderControls();
      await alice.moveOpenTask('Milk', 'down');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk']);

      await alice.openRailUnlisted();
      await alice.shouldBeOnAllUnlistedPile();
      await alice.shouldNotSeeCreateTaskListPicker();
      await alice.shouldNotSeeMobileTasksRail();

      await alice.openRailSmartView('today');
      await alice.shouldBeOnToday();
      await alice.shouldSeeCreateTaskListPicker();
      await alice.shouldNotSeeReorderControls();
      await alice.shouldNotSeeMobileTasksRail();

      const weekend = await alice.createNamedListFromRail('Weekend');
      await alice.shouldBeOnAllNamedPile(weekend.id);
      await alice.shouldSeeRailItems(railWith('Groceries', 'Weekend'));

      await alice.deleteNamedListFromRail('Weekend');
      await alice.shouldBeOnToday();
      await alice.shouldSeeRailItems(railWith('Groceries'));

      await expect(alice.deleteNamedListFromRail('Groceries')).rejects.toThrow(ConflictError);
      await alice.shouldSeeRailItems(railWith('Groceries'));

      await alice.createCapture({ content: 'Promote me' });
      await alice.openMobileBottomTab('inbox');
      await alice.shouldBeOnInboxPane();
      await alice.openPromoteSheet('Promote me');
      await alice.shouldSeePromoteSheet();
      await alice.cancelPromoteSheet();
      await alice.shouldSeeCaptureOnCurrentPane('Promote me');
    }, 60_000);
  });

  describe(`Desktop rail is unchanged [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-9-desktop-rail@example.com');
    });

    it('still shows the sidebar rail on a wide layout, without bottom tabs', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.useDesktopViewport();

      await alice.openToday();
      await alice.shouldSeeDesktopAppRail();
      await alice.shouldNotSeeMobileBottomNav();
      await alice.shouldSeeRailItems(railWith('Groceries'));

      await alice.openRailNamedList('Groceries');
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldSeeDesktopAppRail();
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Mobile Tasks rail drawer — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs mobile-rail drawer operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-9-mobile-rail-drawer-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.useMobileViewport()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.openMobileBottomTab('tasks')).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeMobileBottomTabs(['Inbox', 'Tasks'])).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeDesktopAppRail()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeTasksContentWithoutMobileRail()).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.openMobileTasksRail()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeMobileTasksRail()).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldNotSeeMobileTasksRail()).rejects.toThrow(UnsupportedOperationError);
    });
  });
});
