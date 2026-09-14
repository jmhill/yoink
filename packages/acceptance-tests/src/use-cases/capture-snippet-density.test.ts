import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #99: Costume — dense capture snippets (source + content, no task chrome).
 *
 * Product lock (Justin + Polly): capture cards read as dense clippings —
 * source + time prominent, more content visible, still no complete / grip /
 * pin / due chrome. Promote stays Promote. Same density on Inbox, Snoozed,
 * and Trash. Mobile tap targets stay ~44px. Theme tokens in light, dark,
 * and tokyo night.
 *
 * Out of scope: pane surface (#98), rail split (#100), ⌘K (#101),
 * Promote rename / Add task / backlinks / vault sync.
 */

const tomorrow = (): string => new Date(Date.now() + 86_400_000).toISOString();

const typedSource = /^typed · (just now|\d+m ago)$/;
const chromeSource = /^Chrome · (just now|\d+m ago)$/;
const androidSource = /^Android · (just now|\d+m ago)$/;

const groceryNote =
  'Buy oat milk, oat groats, and compostable bin liners.\nAlso check prices at Berkeley Bowl.';

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Dense capture snippets [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-21-capture-snippets@example.com');
    });

    it('shows inbox captures as dense snippets with source, time, and triage actions', async () => {
      await alice.createCapture({ content: groceryNote, sourceApp: 'web' });

      await alice.openRailInbox();
      await alice.shouldSeeDenseCaptureSnippet(groceryNote, typedSource);
      await alice.shouldSeeInboxCaptureActions(groceryNote);
      await alice.openPromoteSheet(groceryNote);
      await alice.shouldSeePromoteSheet();
      await alice.cancelPromoteSheet();
      await alice.shouldSeeCaptureOnCurrentPane(groceryNote);
    });

    it('surfaces known sourceApp labels on the source line', async () => {
      await alice.createCapture({
        content: 'Checkout ideas from Figma',
        sourceApp: 'browser-extension',
        sourceUrl: 'https://www.figma.com/file/abc123/checkout-ideas',
      });
      await alice.createCapture({
        content: 'Groceries from my phone',
        sourceApp: 'android-share',
      });

      await alice.openRailInbox();
      await alice.shouldSeeDenseCaptureSnippet('Checkout ideas from Figma', chromeSource);
      await alice.shouldSeeCaptureSourceUrl(
        'Checkout ideas from Figma',
        'https://www.figma.com/file/abc123/checkout-ideas'
      );
      await alice.shouldSeeDenseCaptureSnippet('Groceries from my phone', androidSource);
    });

    it('uses the same snippet density on Snoozed and Trash', async () => {
      const later = await alice.createCapture({ content: 'Snooze this snippet' });
      const gone = await alice.createCapture({ content: 'Trash this snippet' });
      await alice.snoozeCapture(later.id, tomorrow());
      await alice.trashCapture(gone.id);

      await alice.openRailInbox();
      await alice.openInboxPaneTab('snoozed');
      await alice.shouldSeeDenseCaptureSnippet('Snooze this snippet', typedSource);

      await alice.openInboxPaneTab('trash');
      await alice.shouldSeeDenseCaptureSnippet('Trash this snippet', typedSource);
    });

    it('keeps Promote named Promote, and content links do not trash the capture', async () => {
      const linked = 'check this https://example.com/path later';
      await alice.createCapture({ content: linked });

      await alice.openRailInbox();
      await alice.shouldSeeInboxCaptureActions(linked);
      await alice.openCaptureContentLink(linked, 'https://example.com/path');
      await alice.shouldSeeCaptureOnCurrentPane(linked);
      await alice.shouldSeeInboxCaptureActions(linked);
    });

    it('trashes by swipe and keeps ~44px action targets on a phone', async () => {
      await alice.createCapture({ content: 'Keep me' });
      await alice.createCapture({ content: 'Swipe me out' });

      await alice.useMobileViewport();
      await alice.openMobileBottomTab('inbox');
      await alice.shouldSeeDenseCaptureSnippet('Keep me', typedSource);
      await alice.shouldSeeUsableCaptureActionTargets('Keep me');

      await alice.trashCaptureBySwipe('Swipe me out');
      await alice.shouldNotSeeCaptureOnCurrentPane('Swipe me out');
      await alice.shouldSeeCaptureOnCurrentPane('Keep me');

      await alice.openInboxPaneTab('trash');
      await alice.shouldSeeDenseCaptureSnippet('Swipe me out', typedSource);
    });

    it('stays readable in light, dark, and tokyo night', async () => {
      await alice.createCapture({ content: groceryNote, sourceApp: 'web' });

      const appearances = [
        { mode: 'light' as const, colorTheme: 'default' as const },
        { mode: 'dark' as const, colorTheme: 'default' as const },
        { mode: 'light' as const, colorTheme: 'tokyo-night' as const },
        { mode: 'dark' as const, colorTheme: 'tokyo-night' as const },
      ];

      for (const appearance of appearances) {
        await alice.useAppearance(appearance);
        await alice.openRailInbox();
        await alice.shouldSeeDenseCaptureSnippet(groceryNote, typedSource);
        await alice.shouldSeeCaptureSnippetReadable(groceryNote);
      }
    }, 90_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Dense capture snippets — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs snippet-density operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-21-capture-snippets-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeDenseCaptureSnippet(groceryNote, typedSource)).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeUsableCaptureActionTargets(groceryNote)).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeCaptureSnippetReadable(groceryNote)).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.trashCaptureBySwipe(groceryNote)).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
