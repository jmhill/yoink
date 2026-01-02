import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import {
  ForbiddenError,
  NotFoundError,
  UnsupportedOperationError,
} from '@yoink/acceptance-testing';

/**
 * Tests for managing organization invitations.
 *
 * Invitation management requires session-based authentication (not token auth),
 * so these tests only run on the Playwright driver which uses passkey auth.
 *
 * Permission model:
 * - Only admins and owners can create invitations
 * - Only admins and owners can view pending invitations
 * - Only admins and owners can revoke invitations
 * - Members cannot perform any invitation operations
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Managing organization invitations [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('admin can create invitation with member role', async () => {
      // Create an org and sign up an admin
      const org = await ctx.admin.createOrganization('Invite Member Org');
      const adminInvite = await ctx.admin.createInvitation(org.id, { role: 'admin' });
      const admin = await ctx.createActorWithInvitation(adminInvite.code, 'admin-invite@example.com');

      // Switch to the shared org
      await admin.switchOrganization(org.id);

      // Admin should be able to create an invitation
      const invitation = await admin.createInvitation({ role: 'member' });

      expect(invitation.code).toBeDefined();
      expect(invitation.code.length).toBeGreaterThanOrEqual(8);
      expect(invitation.role).toBe('member');
      expect(invitation.organizationId).toBe(org.id);
    });

    it('admin can create invitation with admin role', async () => {
      // Create an org and sign up an admin
      const org = await ctx.admin.createOrganization('Invite Admin Org');
      const adminInvite = await ctx.admin.createInvitation(org.id, { role: 'admin' });
      const admin = await ctx.createActorWithInvitation(adminInvite.code, 'admin-inviteadmin@example.com');

      // Switch to the shared org
      await admin.switchOrganization(org.id);

      // Admin should be able to create an admin invitation
      const invitation = await admin.createInvitation({ role: 'admin' });

      expect(invitation.role).toBe('admin');
    });

    it('admin can create invitation with email restriction', async () => {
      // Create an org and sign up an admin
      const org = await ctx.admin.createOrganization('Invite Email Org');
      const adminInvite = await ctx.admin.createInvitation(org.id, { role: 'admin' });
      const admin = await ctx.createActorWithInvitation(adminInvite.code, 'admin-inviteemail@example.com');

      // Switch to the shared org
      await admin.switchOrganization(org.id);

      // Create invitation with email restriction
      const invitation = await admin.createInvitation({
        role: 'member',
        email: 'restricted@example.com',
      });

      expect(invitation.email).toBe('restricted@example.com');
    });

    it('admin can view pending invitations', async () => {
      // Create an org and sign up an admin
      const org = await ctx.admin.createOrganization('View Invites Org');
      const adminInvite = await ctx.admin.createInvitation(org.id, { role: 'admin' });
      const admin = await ctx.createActorWithInvitation(adminInvite.code, 'admin-viewinvites@example.com');

      // Switch to the shared org
      await admin.switchOrganization(org.id);

      // Create a couple of invitations
      await admin.createInvitation({ role: 'member' });
      await admin.createInvitation({ role: 'admin' });

      // View pending invitations
      const pending = await admin.listPendingInvitations();

      expect(pending.length).toBeGreaterThanOrEqual(2);
      expect(pending.some((i) => i.role === 'member')).toBe(true);
      expect(pending.some((i) => i.role === 'admin')).toBe(true);
    });

    it('admin can revoke invitation', async () => {
      // Create an org and sign up an admin
      const org = await ctx.admin.createOrganization('Revoke Invite Org');
      const adminInvite = await ctx.admin.createInvitation(org.id, { role: 'admin' });
      const admin = await ctx.createActorWithInvitation(adminInvite.code, 'admin-revoke@example.com');

      // Switch to the shared org
      await admin.switchOrganization(org.id);

      // Create an invitation
      const invitation = await admin.createInvitation({ role: 'member' });

      // Revoke it
      await admin.revokeInvitation(invitation.id);

      // Should not appear in pending list
      const pending = await admin.listPendingInvitations();
      expect(pending.some((i) => i.id === invitation.id)).toBe(false);
    });

    it('revoking non-existent invitation throws NotFoundError', async () => {
      const actor = await ctx.createActor('revoke-notfound@example.com');

      // Use a valid UUID format that doesn't exist
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      await expect(actor.revokeInvitation(nonExistentId)).rejects.toThrow(NotFoundError);
    });

    it('member cannot create invitation', async () => {
      // Create an org and sign up a member
      const org = await ctx.admin.createOrganization('Member No Invite Org');
      const memberInvite = await ctx.admin.createInvitation(org.id, { role: 'member' });
      const member = await ctx.createActorWithInvitation(memberInvite.code, 'member-noinvite@example.com');

      // Switch to the shared org
      await member.switchOrganization(org.id);

      // Member should NOT be able to create an invitation
      await expect(member.createInvitation({ role: 'member' })).rejects.toThrow(ForbiddenError);
    });

    it('member cannot view pending invitations', async () => {
      // Create an org and sign up a member
      const org = await ctx.admin.createOrganization('Member No View Org');
      const memberInvite = await ctx.admin.createInvitation(org.id, { role: 'member' });
      const member = await ctx.createActorWithInvitation(memberInvite.code, 'member-noview@example.com');

      // Switch to the shared org
      await member.switchOrganization(org.id);

      // Member should NOT be able to view pending invitations
      await expect(member.listPendingInvitations()).rejects.toThrow(ForbiddenError);
    });

    it('owner can manage invitations in personal org', async () => {
      // Create an actor - they automatically get a personal org where they are owner
      const owner = await ctx.createActor('owner-invites@example.com');

      // Owner should be able to create, view, and revoke invitations
      const invitation = await owner.createInvitation({ role: 'admin' });
      expect(invitation.code).toBeDefined();

      const pending = await owner.listPendingInvitations();
      expect(pending.some((i) => i.id === invitation.id)).toBe(true);

      await owner.revokeInvitation(invitation.id);
      const pendingAfter = await owner.listPendingInvitations();
      expect(pendingAfter.some((i) => i.id === invitation.id)).toBe(false);
    });

    it('existing user can accept invitation to join organization', async () => {
      // Create an existing user (they get their own personal org)
      const existingUser = await ctx.createActor('existing-user@example.com');
      const originalOrgId = existingUser.organizationId;

      // Create a target org with an invitation
      const targetOrg = await ctx.admin.createOrganization('Target Org');
      const invitation = await ctx.admin.createInvitation(targetOrg.id, { role: 'member' });

      // Existing user accepts the invitation
      const result = await existingUser.acceptInvitation(invitation.code);

      // User should now be a member of the new org
      expect(result.organizationId).toBe(targetOrg.id);
      expect(result.organizationName).toBe('Target Org');
      expect(result.role).toBe('member');

      // Verify session was updated to use new org
      const session = await existingUser.getSessionInfo();
      expect(session.organizationId).toBe(targetOrg.id);
      expect(session.organizations.some((o) => o.id === targetOrg.id)).toBe(true);
      expect(session.organizations.some((o) => o.id === originalOrgId)).toBe(true);
    });

    it('accepting invitation fails if already a member', async () => {
      // Create an org and add a user
      const org = await ctx.admin.createOrganization('Already Member Org');
      const memberInvite = await ctx.admin.createInvitation(org.id, { role: 'member' });
      const member = await ctx.createActorWithInvitation(memberInvite.code, 'already-member@example.com');

      // Create another invitation to the same org
      const secondInvite = await ctx.admin.createInvitation(org.id, { role: 'admin' });

      // User tries to accept second invitation to org they're already in
      // Should get AlreadyMemberError
      await expect(member.acceptInvitation(secondInvite.code)).rejects.toThrow('Already a member');
    });

    it('accepting invitation fails for expired invitation', async () => {
      const existingUser = await ctx.createActor('expired-invite@example.com');

      // Use a code that looks valid but doesn't exist or is expired
      await expect(existingUser.acceptInvitation('EXPIRED1')).rejects.toThrow();
    });
  });
});

/**
 * Tests that HTTP driver doesn't support invitation management operations.
 * This is expected because these operations require session-based auth.
 */
usingDrivers(['http'] as const, (ctx) => {
  describe(`Managing invitations - HTTP limitations [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('createInvitation is not supported in HTTP driver', async () => {
      const actor = await ctx.createActor('http-createinvite@example.com');

      const actorWithAllMethods = ctx.createActorWithCredentials({
        email: actor.email,
        userId: actor.userId,
        organizationId: actor.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actorWithAllMethods.createInvitation({ role: 'member' })).rejects.toThrow(
        UnsupportedOperationError
      );
    });

    it('listPendingInvitations is not supported in HTTP driver', async () => {
      const actor = await ctx.createActor('http-listinvites@example.com');

      const actorWithAllMethods = ctx.createActorWithCredentials({
        email: actor.email,
        userId: actor.userId,
        organizationId: actor.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actorWithAllMethods.listPendingInvitations()).rejects.toThrow(
        UnsupportedOperationError
      );
    });

    it('revokeInvitation is not supported in HTTP driver', async () => {
      const actor = await ctx.createActor('http-revokeinvite@example.com');

      const actorWithAllMethods = ctx.createActorWithCredentials({
        email: actor.email,
        userId: actor.userId,
        organizationId: actor.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actorWithAllMethods.revokeInvitation('any-id')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
