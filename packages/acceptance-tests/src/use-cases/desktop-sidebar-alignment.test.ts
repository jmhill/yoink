import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #205: desktop sidebar icons, labels, and counts must share
 * columns and a baseline. Nothing wraps, overlaps, or spills.
 * Mobile drawer layout stays as it is.
 */

const STORY = 'sidebar-desktop';
const SHOT = process.env.SIDEBAR_DESKTOP_SHOT === 'before' ? 'before' : 'after';

const DESKTOP_WIDTHS = [
  { width: 1024, height: 800, step: `${SHOT}_1024` },
  { width: 1280, height: 800, step: `${SHOT}_1280` },
  { width: 1600, height: 900, step: `${SHOT}_1600` },
] as const;

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Desktop sidebar alignment [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-205-sidebar-desktop@example.com');
    });

    it('keeps desktop rail columns aligned at common widths and leaves the phone drawer alone', async () => {
      await alice.createCapture({ content: 'Oldest clip' });
      await alice.createCapture({ content: 'Newest clip' });
      const groceries = await alice.createNamedList('Groceries');
      await alice.createNamedList('Household Shopping');
      await alice.createNamedList('Weekend');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createProject({ name: 'Garden' });
      const later = await alice.createProject({ name: 'Later' });
      await alice.changeProjectStatus(later.id, { status: 'someday' });

      for (const viewport of DESKTOP_WIDTHS) {
        await alice.useDesktopViewport(viewport);
        await alice.openRailWork();
        await alice.shouldSeeDesktopAppRail();
        await alice.saveWalkthroughScreenshot({ story: STORY, step: viewport.step });
      }

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('work');
      await alice.openMobileTasksRail();
      await alice.shouldSeeMobileTasksRail();
      await alice.saveWalkthroughScreenshot({ story: STORY, step: SHOT });

      await alice.useDesktopViewport(DESKTOP_WIDTHS[1]);
      await alice.openRailWork();
      await alice.shouldSeeDesktopAppRail();
      await alice.shouldSeeDesktopRailColumnsAligned();
      await alice.shouldSeeRailLabelOnOneLine('Capture');
      await alice.shouldSeeRailLabelOnOneLine('Work');
      await alice.shouldSeeRailLabelOnOneLine('Household Shopping');
    }, 90_000);

    it('shows the full name of a cut-off desktop list on hover', async () => {
      const name = 'Weekend shopping and household errands for everyone at home';
      await alice.createNamedList(name);
      await alice.useDesktopViewport({ width: 1280, height: 800 });
      await alice.openRailWork();
      await alice.shouldSeeDesktopAppRail();
      await alice.shouldSeeCutOffDesktopListNameOnHover(name);
      await alice.saveWalkthroughScreenshot({
        story: STORY,
        step: 'list_name_hover',
        keepPointer: true,
      });
    }, 60_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Desktop sidebar alignment — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs desktop column alignment as browser-only', async () => {
      const alice = await ctx.createActor('alice-205-sidebar-desktop-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeDesktopRailColumnsAligned()).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeCutOffDesktopListNameOnHover('Household Shopping')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
