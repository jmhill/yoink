import { usingDrivers, describe, it, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Web project page edge [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-project-page-edge@example.com');
    });

    it('loads the project page and a staged import on /web-api', async () => {
      await alice.shouldKeepProjectPageOnWebEdge();
    });
  });
});
