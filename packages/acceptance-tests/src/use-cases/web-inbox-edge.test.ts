import { usingDrivers, describe, it, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Web Inbox edge [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice@example.com');
    });

    it('lists and creates Inbox captures on /web-api and loads Today on /web-api', async () => {
      await alice.shouldKeepInboxOnWebEdgeAndTasksOnWebEdge();
    });
  });
});
