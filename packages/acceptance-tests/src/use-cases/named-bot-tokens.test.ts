import { usingDrivers, describe, it, expect, beforeEach } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { UnauthorizedError } from '@yoink/acceptance-testing';

/**
 * #132 Story 1: each bot has its own named token.
 * Settings UI on desktop and mobile.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  const runSettingsCases = (label: string, prepare: (alice: BrowserActor) => Promise<void>) => {
    describe(`Named bot tokens ${label} [${ctx.driverName}]`, () => {
      let alice: BrowserActor;

      beforeEach(async () => {
        alice = await ctx.createActor(`alice-named-tokens-${label}@example.com`);
        await prepare(alice);
      });

      it('creates a token named Lane and lists when it was made and last used', async () => {
        await alice.createNamedBotTokenFromSettings('Lane');
        await alice.shouldSeeNamedTokenInSettings('Lane');
      });

      it('revokes a token by name so the next bot request is refused', async () => {
        const rawToken = await alice.createNamedBotTokenFromSettings('Lane');
        const bot = ctx.createActorWithCredentials({
          email: alice.email,
          userId: alice.userId,
          organizationId: alice.organizationId,
          token: rawToken,
        });

        const before = await bot.listTokens();
        expect(before.map((token) => token.name)).toContain('Lane');

        await alice.revokeNamedTokenFromSettings('Lane');

        await expect(bot.listTokens()).rejects.toThrow(UnauthorizedError);
      });

      it('shows existing tokens as unnamed until named', async () => {
        await ctx.admin.login();
        await ctx.admin.createToken(alice.organizationId, alice.userId);
        await ctx.admin.logout();

        await alice.nameUnnamedTokenFromSettings('Lane');
        await alice.shouldSeeNamedTokenInSettings('Lane');
      });
    });
  };

  runSettingsCases('on desktop', async (alice) => {
    await alice.useDesktopViewport();
  });

  runSettingsCases('on mobile', async (alice) => {
    await alice.useMobileViewport();
  });
});
