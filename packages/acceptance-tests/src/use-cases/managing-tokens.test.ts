import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import { UnauthorizedError, ForbiddenError } from '@yoink/acceptance-testing';

/**
 * User token self-service.
 *
 * HTTP actors authenticate as bots (Bearer token), so they can list
 * tokens but cannot create, rename, or revoke them.
 */
usingDrivers(['http'] as const, (ctx) => {
  const BOOTSTRAP_TOKEN_NAME = 'test-token';

  describe(`Managing API tokens [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('lists the bootstrap token for a new actor', async () => {
      const alice = await ctx.createActor('alice-token-list@example.com');

      const tokens = await alice.listTokens();

      expect(tokens).toHaveLength(1);
      expect(tokens[0].name).toBe(BOOTSTRAP_TOKEN_NAME);
    });

    it('requires authentication to list tokens', async () => {
      const anonymous = ctx.createActorWithCredentials({
        email: 'anonymous@example.com',
        userId: 'fake-user-id',
        organizationId: 'fake-org-id',
        token: 'invalid-token',
      });

      await expect(anonymous.listTokens()).rejects.toThrow(UnauthorizedError);
    });

    it('refuses create from a bot token', async () => {
      const bob = await ctx.createActor('bob-token-create@example.com');

      await expect(bob.createToken('Lane')).rejects.toThrow(ForbiddenError);
    });

    it('refuses rename from a bot token', async () => {
      const carol = await ctx.createActor('carol-token-rename@example.com');
      const tokens = await carol.listTokens();

      await expect(carol.renameToken(tokens[0].id, 'Lane')).rejects.toThrow(ForbiddenError);
    });

    it('refuses revoke from a bot token', async () => {
      const eve = await ctx.createActor('eve-token-revoke@example.com');
      const tokens = await eve.listTokens();

      await expect(eve.revokeToken(tokens[0].id)).rejects.toThrow(ForbiddenError);
    });
  });
});
