import { usingDrivers, describe, it, expect, beforeAll, afterAll } from './harness.js';
import { UnauthorizedError } from '../dsl/index.js';

/**
 * Tests for API token security.
 * Verifies that revoked tokens are properly rejected.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Token security [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('rejects requests with revoked tokens', async () => {
      // Setup: Create org, user, and token
      const org = await ctx.admin.createOrganization(`revoke-test-${Date.now()}`);
      const user = await ctx.admin.createUser(org.id, `revoke-user-${Date.now()}@example.com`);
      const { rawToken, token } = await ctx.admin.createToken(user.id, 'to-be-revoked');

      // Create actor with the token
      const actor = ctx.createActorWithCredentials({
        email: user.email,
        userId: user.id,
        organizationId: org.id,
        token: rawToken,
      });

      // Verify token works initially
      const capture = await actor.createCapture({ content: 'test capture' });
      expect(capture.content).toBe('test capture');

      // Revoke the token
      await ctx.admin.revokeToken(token.id);

      // Verify token no longer works
      await expect(actor.createCapture({ content: 'should fail' })).rejects.toThrow(
        UnauthorizedError
      );
    });

    it('rejects requests with invalid token format', async () => {
      const invalidActor = ctx.createActorWithCredentials({
        email: 'fake@example.com',
        userId: 'fake-user-id',
        organizationId: 'fake-org-id',
        token: 'not-a-valid-token',
      });

      await expect(invalidActor.listCaptures()).rejects.toThrow(UnauthorizedError);
    });

    it('rejects requests with non-existent token id', async () => {
      const fakeActor = ctx.createActorWithCredentials({
        email: 'fake@example.com',
        userId: 'fake-user-id',
        organizationId: 'fake-org-id',
        token: '00000000-0000-0000-0000-000000000000:fakesecret',
      });

      await expect(fakeActor.listCaptures()).rejects.toThrow(UnauthorizedError);
    });
  });
});
