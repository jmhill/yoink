import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import {
  ForbiddenError,
  CannotRemoveSelfError,
  UnsupportedOperationError,
} from '@yoink/acceptance-testing';

/**
 * Tests for managing organization members.
 *
 * Member management requires session-based authentication (not token auth),
 * so these tests only run on the Playwright driver which uses passkey auth.
 *
 * Permission model:
 * - All members can view the members list
 * - Admins can remove members (but not other admins)
 * - Owners can remove admins and members
 * - Cannot remove self (use leave instead)
 * - Cannot remove the last owner
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Managing organization members [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('member can view members list', async () => {
      // Create an org
      const org = await ctx.admin.createOrganization('View Members Org');

      // Invite a member
      const memberInvite = await ctx.admin.createInvitation(org.id, { role: 'member' });

      // Sign up a member
      const member = await ctx.createActorWithInvitation(
        memberInvite.code,
        'member-view@example.com'
      );

      // Switch member to the shared org
      await member.switchOrganization(org.id);

      // Member should be able to view the members list
      const members = await member.listMembers();

      expect(members.length).toBeGreaterThanOrEqual(1);
      expect(members.some((m) => m.email === member.email)).toBe(true);
    });

    it('admin can remove member', async () => {
      // Create an org
      const org = await ctx.admin.createOrganization('Admin Remove Org');

      // Create invitations for admin and member
      const adminInvite = await ctx.admin.createInvitation(org.id, { role: 'admin' });
      const memberInvite = await ctx.admin.createInvitation(org.id, { role: 'member' });

      // Sign up both
      const admin = await ctx.createActorWithInvitation(
        adminInvite.code,
        'admin-remove@example.com'
      );
      const member = await ctx.createActorWithInvitation(
        memberInvite.code,
        'member-remove@example.com'
      );

      // Switch admin to the shared org
      await admin.switchOrganization(org.id);

      // Admin should be able to remove the member
      await admin.removeMember(member.userId);

      // Verify member is no longer in the list
      const members = await admin.listMembers();
      expect(members.some((m) => m.userId === member.userId)).toBe(false);
    });

    it('admin cannot remove another admin', async () => {
      // Create an org
      const org = await ctx.admin.createOrganization('Admin Cannot Remove Admin Org');

      // Create two admin invitations
      const admin1Invite = await ctx.admin.createInvitation(org.id, { role: 'admin' });
      const admin2Invite = await ctx.admin.createInvitation(org.id, { role: 'admin' });

      // Sign up both admins
      const admin1 = await ctx.createActorWithInvitation(
        admin1Invite.code,
        'admin1-noadmin@example.com'
      );
      const admin2 = await ctx.createActorWithInvitation(
        admin2Invite.code,
        'admin2-noadmin@example.com'
      );

      // Switch admin1 to the shared org
      await admin1.switchOrganization(org.id);

      // Admin1 should NOT be able to remove Admin2
      await expect(admin1.removeMember(admin2.userId)).rejects.toThrow(ForbiddenError);
    });

    it('owner can remove admin', async () => {
      // Create an actor - they automatically get a personal org where they are owner
      const ownerActor = await ctx.createActor('owner-removeadmin@example.com');

      // Get owner's personal org
      const session = await ownerActor.getSessionInfo();
      const personalOrg = session.organizations.find((o) => o.isPersonal);
      expect(personalOrg).toBeDefined();
      expect(personalOrg?.role).toBe('owner');

      // Create invitation for an admin to join the personal org
      await ownerActor.switchOrganization(personalOrg!.id);
      const adminInvite = await ownerActor.createInvitation({ role: 'admin' });

      // Sign up the admin
      const adminActor = await ctx.createActorWithInvitation(
        adminInvite.code,
        'admin-inpersonal@example.com'
      );

      // Verify admin joined
      const members = await ownerActor.listMembers();
      expect(members.some((m) => m.userId === adminActor.userId)).toBe(true);

      // Owner should be able to remove the admin
      await ownerActor.removeMember(adminActor.userId);

      // Verify admin is removed
      const membersAfter = await ownerActor.listMembers();
      expect(membersAfter.some((m) => m.userId === adminActor.userId)).toBe(false);
    });

    it('cannot remove self', async () => {
      const actor = await ctx.createActor('self-remove@example.com');

      await expect(actor.removeMember(actor.userId)).rejects.toThrow(CannotRemoveSelfError);
    });

    it('member cannot remove anyone', async () => {
      // Create an org
      const org = await ctx.admin.createOrganization('Member Cannot Remove Org');

      // Create invitations for two members
      const member1Invite = await ctx.admin.createInvitation(org.id, { role: 'member' });
      const member2Invite = await ctx.admin.createInvitation(org.id, { role: 'member' });

      // Sign up both
      const member1 = await ctx.createActorWithInvitation(
        member1Invite.code,
        'member1-noremove@example.com'
      );
      const member2 = await ctx.createActorWithInvitation(
        member2Invite.code,
        'member2-noremove@example.com'
      );

      // Switch member1 to the shared org
      await member1.switchOrganization(org.id);

      // Member1 should NOT be able to remove Member2
      await expect(member1.removeMember(member2.userId)).rejects.toThrow(ForbiddenError);
    });
  });
});

/**
 * Tests that HTTP driver doesn't support member management operations.
 * This is expected because these operations require session-based auth.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Managing members - HTTP limitations [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('listMembers is not supported in HTTP driver', async () => {
      const actor = await ctx.createActor('http-listmembers@example.com');

      const actorWithAllMethods = ctx.createActorWithCredentials({
        email: actor.email,
        userId: actor.userId,
        organizationId: actor.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actorWithAllMethods.listMembers()).rejects.toThrow(UnsupportedOperationError);
    });

    it('removeMember is not supported in HTTP driver', async () => {
      const actor = await ctx.createActor('http-removemember@example.com');

      const actorWithAllMethods = ctx.createActorWithCredentials({
        email: actor.email,
        userId: actor.userId,
        organizationId: actor.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actorWithAllMethods.removeMember('any-user-id')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
