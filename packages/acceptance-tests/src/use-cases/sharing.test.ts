import { describeFeature, expect } from './harness.js';
import type { Actor } from '../dsl/index.js';

/**
 * Tests for the share target feature (PWA).
 * These tests verify the /share route works correctly when receiving
 * share intents from Android or other platforms.
 */
describeFeature(
  'Sharing content',
  ['playwright'],
  ({ createActor, it, beforeEach }) => {
    let alice: Actor;

    beforeEach(async () => {
      alice = await createActor('alice@example.com');
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

    it('can capture URL-only share', async () => {
      const sharedUrl = `https://example.com/page-${Date.now()}`;

      const capture = await alice.shareContent({ url: sharedUrl });

      // When only URL is shared, it becomes the content
      expect(capture.content).toBe(sharedUrl);
      expect(capture.sourceUrl).toBe(sharedUrl);
    });
  }
);
