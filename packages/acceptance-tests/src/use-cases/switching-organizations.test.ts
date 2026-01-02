import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import { NotMemberError, UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Tests for switching organizations.
 *
 * Organization switching requires session-based authentication (not token auth),
 * so these tests only run on the Playwright driver which uses passkey auth.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Switching organizations [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('can view session info including organizations', async () => {
      // Create an actor (this creates their personal org and signs them up via passkey)
      const alice = await ctx.createActor('alice-switch@example.com');

      // Get Alice's session to see her organizations
      const session = await alice.getSessionInfo();

      expect(session.user.email).toBe(alice.email);
      expect(session.organizationId).toBeDefined();
      expect(session.organizations).toBeDefined();
      expect(session.organizations.length).toBeGreaterThanOrEqual(1);

      // Personal org should be present
      const personalOrg = session.organizations.find((org) => org.isPersonal);
      expect(personalOrg).toBeDefined();
      expect(personalOrg?.role).toBe('owner');
    });

    it('cannot switch to an organization the user is not a member of', async () => {
      const bob = await ctx.createActor('bob-switch@example.com');

      // Create an org that Bob is not a member of
      const otherOrg = await ctx.admin.createOrganization('Other Org');

      await expect(bob.switchOrganization(otherOrg.id)).rejects.toThrow(NotMemberError);
    });

    it('session info includes current organization and role', async () => {
      const carol = await ctx.createActor('carol-session@example.com');

      const session = await carol.getSessionInfo();

      // The current org should be in the organizations list
      const currentOrg = session.organizations.find(
        (org) => org.id === session.organizationId
      );
      expect(currentOrg).toBeDefined();
      expect(currentOrg?.isPersonal).toBe(true);
      expect(currentOrg?.role).toBe('owner');
    });
  });
});

/**
 * Tests that HTTP driver doesn't support organization switching.
 * This is expected because switching requires session-based auth.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Switching organizations - HTTP limitations [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('switchOrganization is not supported in HTTP driver (requires session auth)', async () => {
      const dan = await ctx.createActor('dan-switch@example.com');

      // Use createActorWithCredentials to get the full Actor type which includes
      // all methods (even those that throw UnsupportedOperationError)
      const danWithAllMethods = ctx.createActorWithCredentials({
        email: dan.email,
        userId: dan.userId,
        organizationId: dan.organizationId,
        token: 'any-token', // Token doesn't matter since we're testing the method throws
      }) as BrowserActor;

      await expect(danWithAllMethods.switchOrganization('any-org-id')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
