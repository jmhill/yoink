import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

/**
 * Tests for the share target feature (PWA).
 * These tests verify the /share route works correctly when receiving
 * share intents from Android or other platforms.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Sharing content [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice@example.com');
    });

    it('can capture shared text via share target', async () => {
      const sharedText = `shared-note-${Date.now()}`;

      const capture = await alice.shareContent({ text: sharedText });

      expect(capture.content).toBe(sharedText);
      expect(capture.status).toBe('inbox');

      // Verify it appears in the inbox
      const captures = await alice.listCaptures();
      expect(captures.some((c) => c.content === sharedText)).toBe(true);
    });

    it('can capture shared URL with text', async () => {
      const sharedUrl = 'https://example.com/article';
      const sharedText = `Interesting article ${Date.now()}`;

      const capture = await alice.shareContent({
        text: sharedText,
        url: sharedUrl,
      });

      expect(capture.content).toBe(sharedText);
      expect(capture.sourceUrl).toBe(sharedUrl);
    });

    it('can capture URL-only share via url param', async () => {
      const sharedUrl = `https://example.com/page-${Date.now()}`;

      const capture = await alice.shareContent({ url: sharedUrl });

      // When only URL is shared, content is a placeholder and sourceUrl is set
      expect(capture.content).toBe('Shared from example.com');
      expect(capture.sourceUrl).toBe(sharedUrl);
    });

    it('extracts URL from text param when apps share URL-only in text (like Twitter/X)', async () => {
      // Twitter/X and LinkedIn share URLs in the text param, not the url param
      const sharedUrl = 'https://x.com/user/status/123456789';

      const capture = await alice.shareContent({ text: sharedUrl });

      // URL should be extracted to sourceUrl, content should be placeholder
      expect(capture.sourceUrl).toBe(sharedUrl);
      expect(capture.content).toBe('Shared from x.com');
    });

    it('extracts URL from text param for LinkedIn shares', async () => {
      const sharedUrl = 'https://www.linkedin.com/posts/user_post-123456';

      const capture = await alice.shareContent({ text: sharedUrl });

      expect(capture.sourceUrl).toBe(sharedUrl);
      expect(capture.content).toBe('Shared from linkedin.com');
    });
  });
});
