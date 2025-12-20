import { describeFeature, expect } from './harness.js';
import type { Actor } from '../dsl/index.js';

/**
 * Tests for offline handling in the PWA.
 * Verifies that the app properly handles network disconnection.
 */
describeFeature(
  'Offline handling',
  ['playwright'],
  ({ createActor, it, beforeEach, afterEach }) => {
    let alice: Actor;

    beforeEach(async () => {
      alice = await createActor('alice@example.com');
      // Ensure we're configured and online
      await alice.createCapture({ content: 'setup capture' });
    });

    afterEach(async () => {
      // Always restore online state
      await alice.goOnline();
    });

    it('shows offline banner when network is disconnected', async () => {
      await alice.goOffline();

      const bannerVisible = await alice.isOfflineBannerVisible();

      expect(bannerVisible).toBe(true);
    });

    it('hides offline banner when network is restored', async () => {
      await alice.goOffline();
      await alice.goOnline();

      const bannerVisible = await alice.isOfflineBannerVisible();

      expect(bannerVisible).toBe(false);
    });

    it('disables quick-add input when offline', async () => {
      await alice.goOffline();

      const inputDisabled = await alice.isQuickAddDisabled();

      expect(inputDisabled).toBe(true);
    });
  }
);
