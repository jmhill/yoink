import { usingDrivers, describe, it, beforeEach, afterEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

/**
 * Tests for offline handling in the PWA.
 * Verifies that the app properly communicates network status
 * and prevents operations that require connectivity.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Offline handling [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice@example.com');
      // Ensure we're configured and online
      await alice.createCapture({ content: 'setup capture' });
    });

    afterEach(async () => {
      // Always restore online state
      await alice.goOnline();
    });

    it('warns user when network is disconnected', async () => {
      await alice.goOffline();

      await alice.shouldSeeOfflineWarning();
    });

    it('clears warning when network is restored', async () => {
      await alice.goOffline();
      await alice.goOnline();

      await alice.shouldNotSeeOfflineWarning();
    });

    it('prevents adding captures when offline', async () => {
      await alice.goOffline();

      await alice.shouldNotBeAbleToAddCaptures();
    });

    it('allows adding captures when online', async () => {
      // Verify baseline - should be able to add captures when online
      await alice.shouldBeAbleToAddCaptures();
    });
  });
});
