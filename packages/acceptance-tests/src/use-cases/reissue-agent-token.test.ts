import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor, CoreActor } from '@yoink/acceptance-testing';
import { ForbiddenError, UnauthorizedError } from '@yoink/acceptance-testing';

/**
 * #132: owner issues a new token for an existing agent member.
 * The old token dies immediately. Member identity and history stay put.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Reissue agent token [${ctx.driverName}]`, () => {
    let alice: CoreActor;

    beforeEach(async () => {
      alice = await ctx.createActor('alice-reissue-http@example.com');
    });

    it('refuses reissue from a bot token', async () => {
      const minted = await alice.mintAgent('Tycho');
      const bot = ctx.createActorWithCredentials({
        email: minted.agent.name,
        userId: minted.agent.userId,
        organizationId: alice.organizationId,
        token: minted.rawToken,
      });

      await expect(bot.reissueAgentToken(minted.agent.userId)).rejects.toThrow(ForbiddenError);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  const runMembersCases = (label: string, prepare: (alice: BrowserActor) => Promise<void>) => {
    describe(`Reissue agent token ${label} [${ctx.driverName}]`, () => {
      let alice: BrowserActor;

      beforeEach(async () => {
        alice = await ctx.createActor(`alice-reissue-${label.replace(/\s+/g, '-')}@example.com`);
        await prepare(alice);
      }, 30_000);

      it('issues a new token for an existing agent from Members', async () => {
        const minted = await alice.mintAgent('Tycho');
        const oldBot = ctx.createActorWithCredentials({
          email: minted.agent.name,
          userId: minted.agent.userId,
          organizationId: alice.organizationId,
          token: minted.rawToken,
        });

        const created = await oldBot.createTask({ title: 'From Tycho' });
        expect(created.createdById).toBe(minted.agent.userId);

        const rawToken = await alice.issueNewTokenForAgentFromMembers('Tycho');
        expect(rawToken).toMatch(/^[^:]+:[^:]+$/);

        await expect(oldBot.listTasks('all')).rejects.toThrow(UnauthorizedError);

        const newBot = ctx.createActorWithCredentials({
          email: minted.agent.name,
          userId: minted.agent.userId,
          organizationId: alice.organizationId,
          token: rawToken,
        });

        const tasks = await newBot.listTasks('all');
        const sameTask = tasks.find((task) => task.id === created.id);
        expect(sameTask?.createdById).toBe(minted.agent.userId);

        const members = await alice.listMembers();
        expect(members.filter((member) => member.name === 'Tycho')).toHaveLength(1);
      }, 60_000);
    });
  };

  runMembersCases('on desktop', async (alice) => {
    await alice.useDesktopViewport();
  });

  runMembersCases('on mobile', async (alice) => {
    await alice.useMobileViewport();
  });
});
