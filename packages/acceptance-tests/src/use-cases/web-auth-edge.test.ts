import { usingDrivers, describe, it, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Web auth edge [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-auth-edge@example.com');
    });

    it('loads session, passkeys, and signup validation on /web-api', async () => {
      await alice.shouldKeepAuthOnWebEdge();
    });
  });
});