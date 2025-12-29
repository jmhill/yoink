import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import { UnauthorizedError, NotFoundError, UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Tests for passkey management endpoints.
 *
 * Note: Full WebAuthn registration testing requires the Playwright driver
 * with CDP virtual authenticator (to be implemented in Phase 7.7b).
 * These HTTP driver tests verify the API endpoints work correctly.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Passkey management [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    describe('listing passkeys', () => {
      it('returns empty list for user with no passkeys', async () => {
        const alice = await ctx.createActor('alice-passkey-list@example.com');

        const passkeys = await alice.listPasskeys();

        expect(passkeys).toEqual([]);
      });

      it('requires authentication to list passkeys', async () => {
        const anonymous = ctx.createActorWithCredentials({
          email: 'anonymous@example.com',
          userId: 'fake-user-id',
          organizationId: 'fake-org-id',
          token: 'invalid-token',
        });

        await expect(anonymous.listPasskeys()).rejects.toThrow(UnauthorizedError);
      });
    });

    describe('deleting passkeys', () => {
      it('returns not found for non-existent passkey', async () => {
        const bob = await ctx.createActor('bob-passkey-delete@example.com');

        await expect(bob.deletePasskey('non-existent-passkey-id')).rejects.toThrow(NotFoundError);
      });

      it('requires authentication to delete passkeys', async () => {
        const anonymous = ctx.createActorWithCredentials({
          email: 'anonymous@example.com',
          userId: 'fake-user-id',
          organizationId: 'fake-org-id',
          token: 'invalid-token',
        });

        await expect(anonymous.deletePasskey('some-passkey-id')).rejects.toThrow(UnauthorizedError);
      });
    });

    describe('registering passkeys', () => {
      it('is not supported in HTTP driver (requires browser)', async () => {
        const carol = await ctx.createActor('carol-passkey-register@example.com');

        // HTTP driver cannot perform WebAuthn registration
        // because it requires browser-level interaction
        await expect(carol.registerPasskey('My MacBook')).rejects.toThrow(UnsupportedOperationError);
      });
    });
  });
});
