import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import { OwnerMustTransferError, ValidationError } from '@yoink/acceptance-testing';

const WALKTHROUGH_STORY = '185-one-owner';

/**
 * Every workspace has at most one owner. The admin panel can set it.
 * Once a workspace has an owner, it cannot be left ownerless.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Workspace owner [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('sets owner on a zero-owner workspace, then that person can mint a bot', async () => {
      const org = await ctx.admin.createOrganization(`polly-ux-${Date.now()}`);
      const invite = await ctx.admin.createInvitation(org.id, { role: 'member' });
      const justin = await ctx.createActorWithInvitation(
        invite.code,
        `justin-owner-${Date.now()}@example.com`
      );

      await justin.switchOrganization(org.id);
      await expect(justin.mintAgent('Too soon')).rejects.toThrow();

      const owner = await ctx.admin.setOrganizationOwner(org.id, justin.userId);
      expect(owner.role).toBe('owner');

      await justin.switchOrganization(org.id);
      const minted = await justin.mintAgent('Polly bot');
      expect(minted.agent.kind).toBe('agent');
      expect(minted.rawToken).toContain(':');
    });

    it('refuses the owner leaving until ownership is transferred', async () => {
      const org = await ctx.admin.createOrganization(`owner-leave-${Date.now()}`);
      const invite = await ctx.admin.createInvitation(org.id, { role: 'member' });
      const owner = await ctx.createActorWithInvitation(
        invite.code,
        `owner-leave-${Date.now()}@example.com`
      );
      await ctx.admin.setOrganizationOwner(org.id, owner.userId);
      await owner.switchOrganization(org.id);

      await expect(owner.leaveOrganization(org.id)).rejects.toThrow(OwnerMustTransferError);

      const users = await ctx.admin.listUsers(org.id);
      expect(users.find((entry) => entry.id === owner.userId)?.role).toBe('owner');

      const driveLeave = async (viewport: 'phone' | 'desktop') => {
        if (viewport === 'phone') {
          await owner.useMobileViewport();
        } else {
          await owner.useDesktopViewport();
        }
        await owner.tryLeaveOrganizationFromSettings(org.name);
        await owner.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'owner_leave_refused',
        });
      };

      await driveLeave('phone');
      await driveLeave('desktop');
    }, 120_000);

    it('refuses making a bot an admin from the panel', async () => {
      const org = await ctx.admin.createOrganization(`bot-admin-${Date.now()}`);
      await expect(
        ctx.admin.createUser(org.id, `bot-${Date.now()}@example.com`, {
          kind: 'agent',
          role: 'admin',
          name: 'Nope',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('drives Make owner and Make admin from the admin panel', async () => {
      const drivePanel = async (viewport: 'phone' | 'desktop') => {
        const stamp = `${viewport}-${Date.now()}`;
        const org = await ctx.admin.createOrganization(`panel-${stamp}`);

        if (viewport === 'phone') {
          await ctx.admin.useMobileViewport();
        } else {
          await ctx.admin.useDesktopViewport();
        }

        await ctx.admin.openOrganization(org.id);
        await ctx.admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'empty_workspace',
        });

        const justin = await ctx.admin.createUser(org.id, `justin-${stamp}@example.com`, {
          name: 'Justin',
          role: 'member',
        });
        const polly = await ctx.admin.createUser(org.id, `polly-${stamp}@example.com`, {
          name: 'Polly',
          role: 'member',
        });
        const libby = await ctx.admin.createUser(org.id, `libby-${stamp}@example.com`, {
          name: 'Libby',
          role: 'member',
        });
        const lane = await ctx.admin.createUser(org.id, `lane-${stamp}@example.com`, {
          kind: 'agent',
          name: 'Lane',
        });
        const otherOrg = await ctx.admin.createOrganization(`other-${stamp}`);
        await ctx.admin.createUser(otherOrg.id, `outsider-${stamp}@example.com`, {
          name: 'Outsider',
          role: 'member',
        });

        await ctx.admin.openOrganization(org.id);
        await ctx.admin.shouldNotSeeNamedUser('Outsider');
        await ctx.admin.shouldSeeMakeOwner(justin.id);
        await ctx.admin.shouldSeeMakeOwner(polly.id);
        await ctx.admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'admin_before_no_owner',
        });
        await ctx.admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'non_member_no_make_owner',
        });

        await ctx.admin.makeOwner(justin.id);
        await ctx.admin.shouldSeeMemberRole(justin.id, 'owner');
        await ctx.admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'make_owner',
        });

        await ctx.admin.makeOwner(polly.id);
        await ctx.admin.shouldSeeMemberRole(polly.id, 'owner');
        await ctx.admin.shouldSeeMemberRole(justin.id, 'admin');
        await ctx.admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'make_owner_old_owner_admin',
        });

        await ctx.admin.makeAdmin(libby.id);
        await ctx.admin.shouldSeeMemberRole(libby.id, 'admin');
        await ctx.admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'member_admin_switch',
        });

        await ctx.admin.shouldNotSeeMakeAdmin(lane.id);
        await ctx.admin.shouldNotSeeMakeOwner(lane.id);
        await ctx.admin.revealMember(lane.id);
        await ctx.admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'bot_row_no_buttons',
        });

        await ctx.admin.openCreateUser();
        await ctx.admin.submitCreateUser({
          email: `bot-admin-${stamp}@example.com`,
          name: 'Nope',
          kind: 'agent',
          role: 'admin',
        });
        await ctx.admin.shouldSeeCreateUserError('A bot cannot be an admin');
        await ctx.admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'bot_create_admin_refused',
        });
      };

      await drivePanel('phone');
      await drivePanel('desktop');
    }, 180_000);

    it('hides Remove on the owner and other admins, and hides all Remove for members', async () => {
      const stamp = Date.now();
      const org = await ctx.admin.createOrganization(`members-remove-${stamp}`);
      const ownerUser = await ctx.admin.createUser(org.id, `owner-${stamp}@example.com`, {
        name: 'Owner Pat',
        role: 'member',
      });
      await ctx.admin.setOrganizationOwner(org.id, ownerUser.id);
      const otherAdminUser = await ctx.admin.createUser(org.id, `other-admin-${stamp}@example.com`, {
        name: 'Other Admin',
        role: 'admin',
      });
      const removableUser = await ctx.admin.createUser(org.id, `removable-${stamp}@example.com`, {
        name: 'Removable',
        role: 'member',
      });

      const adminInvite = await ctx.admin.createInvitation(org.id, { role: 'admin' });
      const workspaceAdmin = await ctx.createActorWithInvitation(
        adminInvite.code,
        `ws-admin-${stamp}@example.com`
      );
      const memberInvite = await ctx.admin.createInvitation(org.id, { role: 'member' });
      const member = await ctx.createActorWithInvitation(
        memberInvite.code,
        `ws-member-${stamp}@example.com`
      );

      await workspaceAdmin.switchOrganization(org.id);
      await member.switchOrganization(org.id);

      const driveAdminMembers = async (viewport: 'phone' | 'desktop') => {
        if (viewport === 'phone') {
          await workspaceAdmin.useMobileViewport();
        } else {
          await workspaceAdmin.useDesktopViewport();
        }
        await workspaceAdmin.openOrganizationSettings();
        await workspaceAdmin.shouldSeeMemberRow(ownerUser.email);
        await workspaceAdmin.shouldNotSeeRemoveOnMember(ownerUser.email);
        await workspaceAdmin.shouldNotSeeRemoveOnMember(otherAdminUser.email);
        await workspaceAdmin.shouldSeeRemoveOnMember(removableUser.email);
        await workspaceAdmin.shouldSeeOwnerCannotBeRemoved();
        await workspaceAdmin.revealMembersSection();
        await workspaceAdmin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'admin_members_no_remove',
        });
        await workspaceAdmin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'owner_cannot_be_removed',
        });
      };

      const driveMemberMembers = async (viewport: 'phone' | 'desktop') => {
        if (viewport === 'phone') {
          await member.useMobileViewport();
        } else {
          await member.useDesktopViewport();
        }
        await member.openOrganizationSettings();
        await member.shouldSeeMemberRow(ownerUser.email);
        await member.shouldNotSeeAnyRemoveButtons();
        await member.revealMembersSection();
        await member.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'member_members_no_remove',
        });
      };

      await driveAdminMembers('phone');
      await driveAdminMembers('desktop');
      await driveMemberMembers('phone');
      await driveMemberMembers('desktop');
    }, 180_000);
  });
});
