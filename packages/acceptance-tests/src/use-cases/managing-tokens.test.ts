import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import { UnauthorizedError, NotFoundError, TokenLimitReachedError } from '@yoink/acceptance-testing';

/**
 * Tests for user token self-service.
 *
 * Users can create, list, and revoke their own API tokens.
 * Tokens are scoped to organizations (one user can have different tokens per org).
 * Maximum 2 tokens per user per organization.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Managing API tokens [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    describe('listing tokens', () => {
      it('returns empty list for user with no tokens', async () => {
        const alice = await ctx.createActor('alice-token-list@example.com');

        const tokens = await alice.listTokens();

        expect(tokens).toEqual([]);
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
    });

    describe('creating tokens', () => {
      it('creates a new token and returns the raw value', async () => {
        const bob = await ctx.createActor('bob-token-create@example.com');

        const result = await bob.createToken('Extension Token');

        expect(result.token.name).toBe('Extension Token');
        expect(result.rawToken).toMatch(/^[^:]+:[^:]+$/); // tokenId:secret format
      });

      it('lists the created token', async () => {
        const carol = await ctx.createActor('carol-token-list@example.com');

        await carol.createToken('My CLI Token');

        const tokens = await carol.listTokens();
        expect(tokens).toHaveLength(1);
        expect(tokens[0].name).toBe('My CLI Token');
      });

      it('enforces the 2-token limit per user per org', async () => {
        const dave = await ctx.createActor('dave-token-limit@example.com');

        // Create 2 tokens (the limit)
        await dave.createToken('Token 1');
        await dave.createToken('Token 2');

        // Third token should fail
        await expect(dave.createToken('Token 3')).rejects.toThrow(TokenLimitReachedError);
      });

      it('requires authentication to create tokens', async () => {
        const anonymous = ctx.createActorWithCredentials({
          email: 'anonymous@example.com',
          userId: 'fake-user-id',
          organizationId: 'fake-org-id',
          token: 'invalid-token',
        });

        await expect(anonymous.createToken('Test Token')).rejects.toThrow(UnauthorizedError);
      });
    });

    describe('revoking tokens', () => {
      it('revokes a token owned by the user', async () => {
        const eve = await ctx.createActor('eve-token-revoke@example.com');

        // Create a token
        const result = await eve.createToken('Token to revoke');

        // Revoke it
        await eve.revokeToken(result.token.id);

        // Verify it's gone
        const tokens = await eve.listTokens();
        expect(tokens).toEqual([]);
      });

      it('returns not found for non-existent token', async () => {
        const frank = await ctx.createActor('frank-token-notfound@example.com');

        await expect(frank.revokeToken('non-existent-token-id')).rejects.toThrow(NotFoundError);
      });

      it('requires authentication to revoke tokens', async () => {
        const anonymous = ctx.createActorWithCredentials({
          email: 'anonymous@example.com',
          userId: 'fake-user-id',
          organizationId: 'fake-org-id',
          token: 'invalid-token',
        });

        await expect(anonymous.revokeToken('some-token-id')).rejects.toThrow(UnauthorizedError);
      });
    });
  });
});
