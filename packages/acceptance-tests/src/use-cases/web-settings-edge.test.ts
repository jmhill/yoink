import { usingDrivers, describe, it, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Web settings edge [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-settings-edge@example.com');
    });

    it('loads members, invitations, and tokens on /web-api and passkeys on /api', async () => {
      await alice.shouldKeepSettingsOnWebEdgeAndPasskeysOnApiAlias();
    });
  });
});
