import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import {
  CannotLeavePersonalOrgError,
  NotMemberError,
  UnsupportedOperationError,
} from '@yoink/acceptance-testing';

/**
 * Tests for leaving organizations.
 *
 * Leaving an organization requires session-based authentication (not token auth),
 * so these tests only run on the Playwright driver which uses passkey auth.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Leaving organizations [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('cannot leave personal organization', async () => {
      const alice = await ctx.createActor('alice-leave@example.com');

      // Get Alice's personal org
      const session = await alice.getSessionInfo();
      const personalOrg = session.organizations.find((org) => org.isPersonal);
      expect(personalOrg).toBeDefined();

      // Try to leave personal org - should fail
      await expect(alice.leaveOrganization(personalOrg!.id)).rejects.toThrow(
        CannotLeavePersonalOrgError
      );
    });

    it('cannot leave an organization the user is not a member of', async () => {
      const bob = await ctx.createActor('bob-leave@example.com');

      // Create an org that Bob is not a member of
      const otherOrg = await ctx.admin.createOrganization('Other Org For Leave Test');

      await expect(bob.leaveOrganization(otherOrg.id)).rejects.toThrow(NotMemberError);
    });

    it('user always has at least their personal organization', async () => {
      const carol = await ctx.createActor('carol-orgs@example.com');

      const session = await carol.getSessionInfo();

      // User should always have at least one org (their personal org)
      expect(session.organizations.length).toBeGreaterThanOrEqual(1);

      // Personal org should exist and user should be owner
      const personalOrg = session.organizations.find((org) => org.isPersonal);
      expect(personalOrg).toBeDefined();
      expect(personalOrg?.role).toBe('owner');
    });
  });
});

/**
 * Tests that HTTP driver doesn't support leaving organizations.
 * This is expected because leaving requires session-based auth.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Leaving organizations - HTTP limitations [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('leaveOrganization is not supported in HTTP driver (requires session auth)', async () => {
      const dan = await ctx.createActor('dan-leave@example.com');

      // Use createActorWithCredentials to get the full Actor type which includes
      // all methods (even those that throw UnsupportedOperationError)
      const danWithAllMethods = ctx.createActorWithCredentials({
        email: dan.email,
        userId: dan.userId,
        organizationId: dan.organizationId,
        token: 'any-token', // Token doesn't matter since we're testing the method throws
      }) as BrowserActor;

      await expect(danWithAllMethods.leaveOrganization('any-org-id')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
