import { usingDrivers, describe, it, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Web work edge [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-work-edge@example.com');
    });

    it('loads Now sections and work lists on /web-api', async () => {
      await alice.shouldKeepWorkOnWebEdge();
    });
  });
});
