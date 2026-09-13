import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Issue #85: linkify http(s) URLs in capture content (including prose).
 *
 * Inbox, Snoozed, and Trash capture rows turn `http://` / `https://`
 * URLs in content into new-tab links. Scheme required — not bare
 * domains, not scheme-less `www.`. Clicking a content link must not
 * Promote, Snooze, or Trash. sourceUrl under the body stays as it is.
 *
 * Out of scope: bare domains, Promote/swipe/chrome changes, task rows,
 * Promote sheet / task title after promote.
 */

const tomorrow = (): string => new Date(Date.now() + 86_400_000).toISOString();

const exactUrl = 'https://example.com/path';
const proseContent = 'check this https://example.com/path later';
const plainContent = 'buy oat milk';

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Capture content linkify [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-ui-story-14-capture-linkify@example.com');
    });

    it('shows a whole-content https URL as a new-tab link', async () => {
      await alice.createCapture({ content: exactUrl });

      await alice.openRailInbox();
      await alice.shouldSeeCaptureContentLink(exactUrl, exactUrl);
      await alice.openCaptureContentLink(exactUrl, exactUrl);
    });

    it('linkifies only the URL inside surrounding prose', async () => {
      await alice.createCapture({ content: proseContent });

      await alice.openRailInbox();
      await alice.shouldSeeCaptureContentLink(proseContent, exactUrl);
    });

    it('leaves free text without a URL as plain text', async () => {
      await alice.createCapture({ content: plainContent });

      await alice.openRailInbox();
      await alice.shouldSeeCaptureContentWithoutLinks(plainContent);
    });

    it('opens the content link without Promote, Snooze, or Trash', async () => {
      await alice.createCapture({ content: exactUrl });

      await alice.openRailInbox();
      await alice.openCaptureContentLink(exactUrl, exactUrl);
      await alice.shouldSeeCaptureOnCurrentPane(exactUrl);
      await alice.shouldSeeInboxCaptureActions(exactUrl);
    });

    it('keeps Promote, Snooze, and Trash working on a capture with a link', async () => {
      const promoteMe = await alice.createCapture({ content: 'https://example.com/promote' });
      const snoozeMe = await alice.createCapture({ content: 'https://example.com/snooze' });
      const trashMe = await alice.createCapture({ content: 'https://example.com/trash' });

      await alice.openRailInbox();
      await alice.openPromoteSheet(promoteMe.content);
      await alice.cancelPromoteSheet();
      await alice.shouldSeeCaptureOnCurrentPane(promoteMe.content);

      await alice.snoozeCapture(snoozeMe.id, tomorrow());
      await alice.trashCapture(trashMe.id);

      await alice.openInboxPaneTab('inbox');
      await alice.shouldSeeCaptureOnCurrentPane(promoteMe.content);
      await alice.shouldNotSeeCaptureOnCurrentPane(snoozeMe.content);
      await alice.shouldNotSeeCaptureOnCurrentPane(trashMe.content);

      await alice.openInboxPaneTab('snoozed');
      await alice.shouldSeeCaptureOnCurrentPane(snoozeMe.content);

      await alice.openInboxPaneTab('trash');
      await alice.shouldSeeCaptureOnCurrentPane(trashMe.content);
    });

    it('linkifies the same way on Snoozed and Trash', async () => {
      const snoozedExact = await alice.createCapture({ content: 'https://example.com/snoozed-exact' });
      const snoozedProse = await alice.createCapture({
        content: 'check this https://example.com/snoozed-prose later',
      });
      const snoozedPlain = await alice.createCapture({ content: 'snoozed plain note' });
      const trashedExact = await alice.createCapture({ content: 'https://example.com/trashed-exact' });
      const trashedProse = await alice.createCapture({
        content: 'check this https://example.com/trashed-prose later',
      });
      const trashedPlain = await alice.createCapture({ content: 'trashed plain note' });

      await alice.snoozeCapture(snoozedExact.id, tomorrow());
      await alice.snoozeCapture(snoozedProse.id, tomorrow());
      await alice.snoozeCapture(snoozedPlain.id, tomorrow());
      await alice.trashCapture(trashedExact.id);
      await alice.trashCapture(trashedProse.id);
      await alice.trashCapture(trashedPlain.id);

      await alice.openRailInbox();
      await alice.openInboxPaneTab('snoozed');
      await alice.shouldSeeCaptureContentLink(snoozedExact.content, snoozedExact.content);
      await alice.shouldSeeCaptureContentLink(
        snoozedProse.content,
        'https://example.com/snoozed-prose'
      );
      await alice.shouldSeeCaptureContentWithoutLinks(snoozedPlain.content);
      await alice.openCaptureContentLink(snoozedExact.content, snoozedExact.content);

      await alice.openInboxPaneTab('trash');
      await alice.shouldSeeCaptureContentLink(trashedExact.content, trashedExact.content);
      await alice.shouldSeeCaptureContentLink(
        trashedProse.content,
        'https://example.com/trashed-prose'
      );
      await alice.shouldSeeCaptureContentWithoutLinks(trashedPlain.content);
      await alice.openCaptureContentLink(trashedExact.content, trashedExact.content);
    });

    it('keeps the source link under the body when sourceUrl is also set', async () => {
      const sourceUrl = 'https://example.com/source';
      await alice.createCapture({
        content: 'check this https://example.com/path later',
        sourceUrl,
      });

      await alice.openRailInbox();
      await alice.shouldSeeCaptureContentLink(proseContent, exactUrl);
      await alice.shouldSeeCaptureSourceUrl(proseContent, sourceUrl);
    });
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Capture content linkify — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs content-linkify operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-ui-story-14-capture-linkify-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldSeeCaptureContentLink(exactUrl, exactUrl)).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeCaptureContentWithoutLinks(plainContent)).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.shouldSeeCaptureSourceUrl(proseContent, exactUrl)).rejects.toThrow(
        UnsupportedOperationError
      );
      await expect(actor.openCaptureContentLink(exactUrl, exactUrl)).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
