import { usingDrivers, describe, it, expect, beforeEach, afterEach } from './harness.js';
import type { BrowserActor } from '../dsl/index.js';

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

      expect(await alice.seesOfflineWarning()).toBe(true);
    });

    it('clears warning when network is restored', async () => {
      await alice.goOffline();
      await alice.goOnline();

      expect(await alice.seesOfflineWarning()).toBe(false);
    });

    it('prevents adding captures when offline', async () => {
      await alice.goOffline();

      expect(await alice.canAddCaptures()).toBe(false);
    });

    it('allows adding captures when online', async () => {
      // Verify baseline - should be able to add captures when online
      expect(await alice.canAddCaptures()).toBe(true);
    });
  });
});
