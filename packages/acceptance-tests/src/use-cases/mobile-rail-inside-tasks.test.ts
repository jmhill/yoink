import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError, UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Yoink UI story 8: mobile layout adaptation of the approved sidebar frame.
 *
 * Polly lock (2026-09-04): bottom tabs stay Inbox | Tasks only — do not put
 * twelve destinations in the thumb bar. Inside Tasks on mobile: the same
 * flat rail as desktop (smart views, Lists heading, named lists, Unlisted,
 * + New list). Desktop rail unchanged.
 *
 * Named-list / Unlisted / smart views / + New list / rail-delete / Promote
 * stay as on trunk after story 7. Out of scope: drag, empty groups, bulk
 * actions, Done-by-list, suggested list at promote, Today/Upcoming nesting,
 * Mine grouping, reintroducing All, new bottom tabs.
 */

const railWith = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list'];

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Mobile rail inside Tasks [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-8-mobile-rail@example.com');
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

    it('shows the flat rail on mobile Tasks and opens the selected screen', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });

      await alice.openMobileBottomTab('tasks');
      await alice.shouldSeeRailItems(railWith('Groceries'));
      await alice.shouldSeeListsHeadingAboveNamedList('Groceries');

      await alice.openRailSmartView('today');
      await alice.shouldBeOnToday();

      await alice.openRailSmartView('upcoming');
      await alice.shouldBeOnTaskFilter('upcoming');

      await alice.openRailSmartView('mine');
      await alice.shouldBeOnMineOverview();

      await alice.openRailSmartView('done');
      await alice.shouldBeOnTaskFilter('completed');

      await alice.openRailNamedList('Groceries');
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldSeeOpenTasksInOrder(['Milk']);

      await alice.openRailUnlisted();
      await alice.shouldBeOnAllUnlistedPile();
    });

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

      await alice.addTaskOnCurrentView('Milk');
      await alice.addTaskOnCurrentView('Eggs');
      await alice.shouldSeeOpenTasksInOrder(['Milk', 'Eggs']);
      await alice.shouldSeeReorderControls();
      await alice.moveOpenTask('Milk', 'down');
      await alice.shouldSeeOpenTasksInOrder(['Eggs', 'Milk']);

      await alice.openRailUnlisted();
      await alice.shouldBeOnAllUnlistedPile();
      await alice.shouldNotSeeCreateTaskListPicker();

      await alice.openRailSmartView('today');
      await alice.shouldBeOnToday();
      await alice.shouldSeeCreateTaskListPicker();
      await alice.shouldNotSeeReorderControls();

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
      alice = await ctx.createActor('alice-ui-story-8-desktop-rail@example.com');
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
  describe(`Mobile rail inside Tasks — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs mobile-rail operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-8-mobile-rail-http@example.com');
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
    });
  });
});
