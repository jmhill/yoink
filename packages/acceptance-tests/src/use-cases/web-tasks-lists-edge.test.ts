import { usingDrivers, describe, it, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Web tasks and lists edge [${ctx.driverName}]`, () => {
    let alice: BrowserActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-tasks-lists-edge@example.com');
    });

    it('loads the task board, named lists, and the unlisted pile on /web-api', async () => {
      await alice.shouldKeepTasksListsOnWebEdge();
    });
  });
});
