import { usingDrivers, describe, it, expect } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #94 wrapped named-list labels in the rail.
 * Issue #205: desktop sidebar must stay one aligned line (no wrap / spill).
 * Mobile Tasks drawer still wraps long names.
 */

const LONG_LIST_NAME =
  'Weekend shopping and household errands for everyone at home';

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Named-list rail labels wrap [${ctx.driverName}]`, () => {
    it('keeps a long named-list name on one line on the desktop rail', async () => {
      const alice = await ctx.createActor('alice-ui-story-18-rail-wrap-desktop@example.com');
      await alice.createNamedList(LONG_LIST_NAME);

      await alice.useDesktopViewport();
      await alice.openToday();
      await alice.shouldSeeDesktopAppRail();
      await alice.shouldSeeRailLabelOnOneLine(LONG_LIST_NAME);
      await alice.shouldSeeNamedListLabelsClearOfCountAndOverflow();
      await alice.shouldSeeNoHorizontalPageScrollFromRail();
    }, 60_000);

    it('keeps highlight, overflow, and navigation on a single-line desktop row', async () => {
      const alice = await ctx.createActor(
        'alice-ui-story-18-rail-wrap-desktop-actions@example.com'
      );
      const list = await alice.createNamedList(LONG_LIST_NAME);

      await alice.useDesktopViewport();
      await alice.openToday();
      await alice.shouldSeeDesktopAppRail();
      await alice.shouldSeeRailLabelOnOneLine(LONG_LIST_NAME);
      await alice.shouldSeeNamedListOverflowOnDesktopSidebar(LONG_LIST_NAME);
      await alice.shouldNotNavigateWhenOpeningNamedListOverflow(LONG_LIST_NAME);
      await alice.shouldBeOnToday();

      await alice.openRailNamedList(LONG_LIST_NAME);
      await alice.shouldBeOnAllNamedPile(list.id);
      await alice.shouldSeeRailNamedListHighlighted(LONG_LIST_NAME);
      await alice.shouldSeeRailLabelOnOneLine(LONG_LIST_NAME);
      await alice.shouldSeeNoHorizontalPageScrollFromRail();
    }, 60_000);

    it('wraps the same name in the mobile Tasks drawer without horizontal scroll', async () => {
      const alice = await ctx.createActor('alice-ui-story-18-rail-wrap-mobile@example.com');
      const list = await alice.createNamedList(LONG_LIST_NAME);

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('work');
      await alice.openMobileTasksRail();
      await alice.shouldSeeMobileTasksRail();
      await alice.shouldSeeWrappedRailNamedList(LONG_LIST_NAME);
      await alice.shouldSeeNoHorizontalPageScrollFromRail();
      await alice.shouldSeeNamedListOverflowAboveMobileDrawer(LONG_LIST_NAME);

      await alice.openRailNamedList(LONG_LIST_NAME);
      await alice.shouldBeOnAllNamedPile(list.id);
    }, 60_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Named-list rail labels wrap — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs wrap and rail-scroll operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-18-rail-wrap-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeWrappedRailNamedList(LONG_LIST_NAME)).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeRailNamedListHighlighted(LONG_LIST_NAME)).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeNoHorizontalPageScrollFromRail()).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
