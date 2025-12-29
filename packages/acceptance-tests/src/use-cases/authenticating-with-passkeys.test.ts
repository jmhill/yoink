import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import { UnauthorizedError } from '@yoink/acceptance-testing';

/**
 * Tests for passkey-based authentication endpoints.
 *
 * Note: Full WebAuthn authentication flow testing requires the Playwright driver
 * with CDP virtual authenticator (to be implemented in Phase 7.7b).
 *
 * These tests verify:
 * 1. Session info endpoint works with token auth (for backwards compatibility)
 * 2. Auth endpoints require proper authentication
 * 3. Login options endpoint is publicly accessible
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Passkey authentication [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    describe('session info endpoint', () => {
      it('returns session info for authenticated user', async () => {
        const alice = await ctx.createActor('alice-session@example.com');

        const sessionInfo = await alice.getSessionInfo();

        expect(sessionInfo.user.id).toBe(alice.userId);
        // Note: The actor's email might be uniquified with a suffix
        expect(sessionInfo.user.email).toContain('alice-session');
        expect(sessionInfo.organizationId).toBe(alice.organizationId);
      });

      it('returns 401 for unauthenticated requests', async () => {
        const anonymous = ctx.createActorWithCredentials({
          email: 'anonymous@example.com',
          userId: 'fake-user-id',
          organizationId: 'fake-org-id',
          token: 'invalid-token',
        });

        await expect(anonymous.getSessionInfo()).rejects.toThrow(UnauthorizedError);
      });
    });

    describe('login options endpoint', () => {
      it('is publicly accessible (no auth required)', async () => {
        // The login options endpoint should be accessible without auth
        // We can test this via a direct HTTP call since we just need to verify
        // the endpoint exists and returns 200
        const response = await fetch(`${ctx.baseUrl}/api/auth/login/options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        expect(response.status).toBe(200);

        const body = await response.json() as { options: unknown; challenge: string };
        expect(body.options).toBeDefined();
        expect(body.challenge).toBeDefined();
      });
    });

    describe('login verify endpoint', () => {
      it('returns 401 for invalid credential', async () => {
        // First get valid options with a challenge
        const optionsResponse = await fetch(`${ctx.baseUrl}/api/auth/login/options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        const optionsBody = await optionsResponse.json() as { challenge: string };

        // Try to verify with a non-existent credential
        const verifyResponse = await fetch(`${ctx.baseUrl}/api/auth/login/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challenge: optionsBody.challenge,
            credential: {
              id: 'non-existent-credential',
              rawId: 'non-existent-credential',
              response: {
                clientDataJSON: 'dGVzdA==',
                authenticatorData: 'dGVzdA==',
                signature: 'dGVzdA==',
              },
              type: 'public-key',
              clientExtensionResults: {},
            },
          }),
        });

        // Should return 401 because the credential doesn't exist
        expect(verifyResponse.status).toBe(401);
      });
    });

    describe('logout endpoint', () => {
      it('returns 401 for unauthenticated requests', async () => {
        const response = await fetch(`${ctx.baseUrl}/api/auth/logout`, {
          method: 'POST',
        });

        expect(response.status).toBe(401);
      });

      // Note: Testing successful logout with session cookie requires Playwright driver
      // The HTTP driver uses token auth, not session auth
    });
  });
});
