import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #98: Costume — Inbox pane uses a subtle warm triage surface
 * (not task white).
 *
 * Product lock (Justin + Polly): costume only. Warmth is secondary.
 * Surface uses the semantic `--inbox-surface` token (theme-native mix of
 * background + muted) so light, dark, and tokyo-night all look correct —
 * not a cream hex. Inbox / Snoozed / Trash share that surface plus an
 * Inbox heading and “N to process · references & triage”. Today and named
 * lists stay on `--background`.
 *
 * Out of scope: #99 capture-card density, #100 rail mode chrome, #101
 * ⌘K, Promote rename / Add task, backlinks, vault sync.
 */

const tomorrow = (): string => new Date(Date.now() + 86_400_000).toISOString();

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Inbox triage surface [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-20-inbox-costume@example.com');
    });

    it('opens Inbox, Snoozed, and Trash on the warm triage surface', async () => {
      await alice.createCapture({ content: 'Stay in inbox' });
      const later = await alice.createCapture({ content: 'Snooze later' });
      const gone = await alice.createCapture({ content: 'Trash me' });
      await alice.snoozeCapture(later.id, tomorrow());
      await alice.trashCapture(gone.id);

      await alice.openRailInbox();
      await alice.shouldBeOnInboxPaneTab('inbox');
      await alice.shouldSeeInboxTriageSurface(1);
      await alice.shouldSeeCaptureOnCurrentPane('Stay in inbox');
      await alice.shouldSeeInboxPaneTabs(['Inbox', 'Snoozed', 'Trash']);

      await alice.openInboxPaneTab('snoozed');
      await alice.shouldBeOnInboxPaneTab('snoozed');
      await alice.shouldSeeInboxTriageSurface(1);
      await alice.shouldSeeCaptureOnCurrentPane('Snooze later');

      await alice.openInboxPaneTab('trash');
      await alice.shouldBeOnInboxPaneTab('trash');
      await alice.shouldSeeInboxTriageSurface(1);
      await alice.shouldSeeCaptureOnCurrentPane('Trash me');
    });

    it('keeps Today and a named list on the cool task surface', async () => {
      await alice.createNamedListFromRail('Groceries');
      await alice.shouldSeeTaskSurface();

      await alice.openToday();
      await alice.shouldBeOnTaskFilter('today');
      await alice.shouldSeeTaskSurface();

      await alice.openRailNamedList('Groceries');
      await alice.shouldSeeTaskSurface();
    });

    it('keeps Inbox distinct from Today in light, dark, and tokyo-night', async () => {
      await alice.createCapture({ content: 'Theme check' });

      const appearances = [
        { mode: 'light' as const, colorTheme: 'default' as const },
        { mode: 'dark' as const, colorTheme: 'default' as const },
        { mode: 'light' as const, colorTheme: 'tokyo-night' as const },
      ];

      for (const appearance of appearances) {
        await alice.useAppearance(appearance);
        await alice.openRailInbox();
        await alice.shouldSeeInboxTriageSurface(1);
        await alice.shouldSeeInboxSurfaceDistinctFromTaskSurface();
      }
    }, 60_000);

    it('keeps Promote, Snooze, Trash, the count badge, and tabs working', async () => {
      const keep = await alice.createCapture({ content: 'Triage me' });
      const later = await alice.createCapture({ content: 'Snooze later' });
      const gone = await alice.createCapture({ content: 'Trash me' });

      await alice.openRailInbox();
      await alice.shouldSeeInboxTriageSurface(3);
      await alice.shouldSeeInboxCountOnRail(3);
      await alice.shouldSeeInboxCaptureActions('Triage me');

      await alice.openPromoteSheet('Triage me');
      await alice.shouldSeePromoteSheet();
      await alice.cancelPromoteSheet();
      await alice.shouldSeeCaptureOnCurrentPane('Triage me');

      await alice.snoozeCapture(later.id, tomorrow());
      await alice.trashCapture(gone.id);

      await alice.openRailInbox();
      await alice.shouldSeeInboxTriageSurface(1);
      await alice.shouldSeeInboxCountOnRail(1);
      await alice.shouldSeeCaptureOnCurrentPane(keep.content);
      await alice.shouldSeeInboxPaneTabs(['Inbox', 'Snoozed', 'Trash']);

      await alice.openInboxPaneTab('snoozed');
      await alice.shouldSeeInboxTriageSurface(1);
      await alice.shouldSeeCaptureOnCurrentPane('Snooze later');

      await alice.openInboxPaneTab('trash');
      await alice.shouldSeeInboxTriageSurface(1);
      await alice.shouldSeeCaptureOnCurrentPane('Trash me');
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Inbox triage surface — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs triage-surface operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-20-inbox-costume-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeInboxTriageSurface(1)).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeTaskSurface()).rejects.toThrow(UnsupportedOperationError);
      await expect(
        actor.useAppearance({ mode: 'dark', colorTheme: 'tokyo-night' })
      ).rejects.toThrow(UnsupportedOperationError);
      await expect(actor.shouldSeeInboxSurfaceDistinctFromTaskSurface()).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
