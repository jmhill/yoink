import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #110: You-are-here headings on Inbox and task views.
 *
 * Product lock (Justin 2026-09-17): fix headings across the app for
 * consistent wayfinding. Mobile Inbox | Tasks bottom bar stays. Tasks
 * landing stays Today. Pin chrome stays gone (#111).
 *
 * Every task view/pile gets Inbox-grade place chrome: the view or list
 * name as the primary heading, plus a short count cue. Inbox heading
 * language stays the reference.
 *
 * Out of scope: removing/redesigning the bottom bar, realtime, pin
 * remove, new destinations.
 */

const isoDateOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0]!;

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`You-are-here headings [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-24-place-headings@example.com');
    });

    it('shows Today, named list, and Unlisted place names on mobile without opening the rail', async () => {
      const groceries = await alice.createNamedList('Groceries');
      await alice.createTask({ title: 'Milk', listId: groceries.id });
      await alice.createTask({
        title: 'Call',
        listId: groceries.id,
        dueDate: isoDateOffset(0),
      });
      await alice.createTask({ title: 'Loose' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('tasks');
      await alice.shouldSeeMobileBottomTabs(['Inbox', 'Tasks']);
      await alice.shouldNotSeeMobileTasksRail();
      await alice.shouldSeeTasksContentWithoutMobileRail();
      await alice.shouldSeeTaskPlace('Today', '1 open');

      await alice.openRailNamedList('Groceries');
      await alice.shouldNotSeeMobileTasksRail();
      await alice.shouldSeeTaskPlace('Groceries', '2 open');
      await alice.shouldSeeMobileBottomTabs(['Inbox', 'Tasks']);

      await alice.openRailUnlisted();
      await alice.shouldNotSeeMobileTasksRail();
      await alice.shouldSeeTaskPlace('Unlisted', '1 open');
      await alice.shouldSeeMobileBottomTabs(['Inbox', 'Tasks']);
    });

    it('shows Upcoming, Mine, and Done place headings on desktop', async () => {
      await alice.createTask({ title: 'Later', dueDate: isoDateOffset(2) });
      await alice.createTask({ title: 'Mine only', assigneeId: alice.userId });
      const done = await alice.createTask({ title: 'Finished' });
      await alice.completeTask(done.id);

      await alice.useDesktopViewport();
      await alice.openRailSmartView('upcoming');
      await alice.shouldSeeTaskPlace('Upcoming', '1 open');
      await alice.shouldNotSeeMobileBottomNav();

      await alice.openRailSmartView('mine');
      await alice.shouldSeeTaskPlace('Mine', '1 assigned');

      await alice.openRailSmartView('done');
      await alice.shouldSeeTaskPlace('Done', '1 completed');

      await alice.openToday();
      await alice.shouldSeeTaskPlace('Today', '0 open');
    });

    it('keeps Inbox heading language and the Inbox | Tasks bottom bar', async () => {
      await alice.createCapture({ content: 'Triage me' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('inbox');
      await alice.shouldSeeInboxTriageSurface(1);
      await alice.shouldSeeMobileBottomTabs(['Inbox', 'Tasks']);

      await alice.openMobileBottomTab('tasks');
      await alice.shouldSeeTaskPlace('Today', '0 open');
      await alice.shouldSeeMobileBottomTabs(['Inbox', 'Tasks']);

      await alice.openMobileBottomTab('inbox');
      await alice.shouldSeeInboxTriageSurface(1);
      await alice.shouldSeeMobileBottomTabs(['Inbox', 'Tasks']);
    });

    it('keeps place headings readable in light, dark, and tokyo-night', async () => {
      await alice.createTask({ title: 'Theme check', dueDate: isoDateOffset(0) });
      await alice.openToday();
      await alice.shouldSeeTaskPlace('Today', '1 open');

      const appearances = [
        { mode: 'light' as const, colorTheme: 'default' as const },
        { mode: 'dark' as const, colorTheme: 'default' as const },
        { mode: 'light' as const, colorTheme: 'tokyo-night' as const },
        { mode: 'dark' as const, colorTheme: 'tokyo-night' as const },
      ];

      for (const appearance of appearances) {
        await alice.useAppearance(appearance);
        await alice.openToday();
        await alice.shouldSeeTaskPlace('Today', '1 open');
        await alice.shouldSeeTaskPlaceReadable();
      }
    }, 90_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`You-are-here headings — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs place-heading operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-24-place-headings-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeTaskPlace('Today', '1 open')).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeTaskPlaceReadable()).rejects.toThrow(UnsupportedOperationError);
    });
  });
});
