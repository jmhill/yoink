import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { ConflictError, UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #100: Costume — rail loudly separates Inbox mode from the task family.
 *
 * Product lock: Inbox first (count badge unchanged) as a capture/triage
 * mode, then a loud split before Today → Upcoming → Mine → Done, then
 * Lists heading + named lists + Unlisted + + New list. No new destinations.
 * All stays retired. Thumb bar stays Inbox | Tasks.
 *
 * Out of scope: pane surface (#98), capture-card density (#99), ⌘K (#101),
 * lifecycle / Promote domain, new nav destinations.
 */

const railWith = (...names: string[]): string[] =>
  ['Inbox', 'Today', 'Upcoming', 'Mine', 'Done', ...names, 'Unlisted', 'New list'];

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Inbox mode rail separation [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-22-inbox-rail-mode@example.com');
    });

    it('reads Inbox as a mode, loud-separated from the task family on the desktop sidebar', async () => {
      await alice.createCapture({ content: 'Triage me' });
      await alice.createNamedList('Groceries');
      await alice.useDesktopViewport();

      await alice.openRailInbox();
      await alice.shouldSeeDesktopAppRail();
      await alice.shouldSeeRailItems(railWith('Groceries'));
      await alice.shouldSeeInboxCountOnRail(1);
      await alice.shouldSeeInboxModeSeparatedFromTaskFamily();
      await alice.shouldSeeListsHeadingAboveNamedList('Groceries');
      await alice.shouldNotSeeMobileBottomNav();
    });

    it('shows the same separated structure in the mobile Tasks drawer; thumb bar stays Inbox | Tasks', async () => {
      await alice.createNamedList('Groceries');
      await alice.useMobileViewport();

      await alice.openMobileBottomTab('inbox');
      await alice.shouldSeeMobileBottomTabs(['Inbox', 'Tasks']);
      await alice.shouldNotSeeMobileBottomTab('Today');
      await alice.shouldNotSeeMobileBottomTab('Unlisted');
      await alice.shouldNotSeeMobileBottomTab('New list');

      await alice.openMobileBottomTab('tasks');
      await alice.shouldSeeMobileBottomTabs(['Inbox', 'Tasks']);
      await alice.shouldNotSeeMobileTasksRail();

      await alice.openMobileTasksRail();
      await alice.shouldSeeMobileTasksRail();
      await alice.shouldSeeRailItems(railWith('Groceries'));
      await alice.shouldSeeInboxModeSeparatedFromTaskFamily();
      await alice.shouldSeeListsHeadingAboveNamedList('Groceries');
    });

    it('keeps Today, lists, Unlisted, + New list, and overflow delete working', async () => {
      await alice.createCapture({ content: 'Keep the badge' });

      await alice.openRailSmartView('today');
      await alice.shouldBeOnToday();
      await alice.shouldSeeInboxModeSeparatedFromTaskFamily();
      await alice.shouldSeeInboxCountOnRail(1);

      const groceries = await alice.createNamedListFromRail('Groceries');
      await alice.shouldBeOnAllNamedPile(groceries.id);
      await alice.shouldSeeAddTaskField();
      await alice.addTaskOnCurrentView('Milk');
      await alice.shouldSeeNamedListOverflowOnRail('Groceries');

      await alice.openRailUnlisted();
      await alice.shouldBeOnAllUnlistedPile();
      await alice.shouldNotSeeNamedListOverflowOnRail('Unlisted');

      const weekend = await alice.createNamedListFromRail('Weekend');
      await alice.shouldBeOnAllNamedPile(weekend.id);
      await alice.shouldSeeRailItems(railWith('Groceries', 'Weekend'));

      await alice.deleteNamedListFromRail('Weekend');
      await alice.shouldBeOnToday();
      await alice.shouldSeeRailItems(railWith('Groceries'));
      await alice.shouldSeeInboxModeSeparatedFromTaskFamily();

      await expect(alice.deleteNamedListFromRail('Groceries')).rejects.toThrow(ConflictError);
      await alice.shouldSeeRailItems(railWith('Groceries'));
    });

    it('keeps the Inbox-vs-task split distinct in light, dark, and tokyo night', async () => {
      await alice.createNamedList('Groceries');

      const appearances = [
        { mode: 'light' as const, colorTheme: 'default' as const },
        { mode: 'dark' as const, colorTheme: 'default' as const },
        { mode: 'light' as const, colorTheme: 'tokyo-night' as const },
        { mode: 'dark' as const, colorTheme: 'tokyo-night' as const },
      ];

      for (const appearance of appearances) {
        await alice.useAppearance(appearance);
        await alice.useDesktopViewport();
        await alice.openRailInbox();
        await alice.shouldSeeDesktopAppRail();
        await alice.shouldSeeInboxModeSeparatedFromTaskFamily();
        await alice.shouldSeeListsHeadingAboveNamedList('Groceries');
      }
    }, 90_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Inbox mode rail separation — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs rail-mode operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-22-inbox-rail-mode-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeInboxModeSeparatedFromTaskFamily()).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
