import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import {
  ForbiddenError,
  UnauthorizedError,
  UnsupportedOperationError,
  ValidationError,
} from '@yoink/acceptance-testing';
import type { BrowserActor } from '@yoink/acceptance-testing';
import {
  BOT_CANNOT_BE_ADMIN_MESSAGE,
  CANNOT_CHANGE_OWN_ROLE_MESSAGE,
  MAKE_ADMIN_LABEL,
  MAKE_MEMBER_LABEL,
  OWNER_ROLE_LOCKED_MESSAGE,
  REISSUE_NOT_ALLOWED_MESSAGE,
  REMOVE_NOT_ALLOWED_MESSAGE,
  ROLE_CHANGE_NOT_ALLOWED_MESSAGE,
  madeAdminToast,
  madeMemberToast,
} from '@yoink/api-contracts';

const WALKTHROUGH_STORY = '191-member-roles';

const setViewport = async (
  actor: { useMobileViewport: () => Promise<void>; useDesktopViewport: () => Promise<void> },
  viewport: 'phone' | 'desktop'
) => {
  if (viewport === 'phone') {
    await actor.useMobileViewport();
  } else {
    await actor.useDesktopViewport();
  }
};

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Changing member roles [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    const provisionWorkspace = async (label: string) => {
      const stamp = `${label}-${Date.now()}`;
      const org = await ctx.admin.createOrganization(`roles-${stamp}`);
      const ownerInvite = await ctx.admin.createInvitation(org.id, { role: 'member' });
      const owner = await ctx.createActorWithInvitation(
        ownerInvite.code,
        `justin-${stamp}@example.com`
      );
      await ctx.admin.setOrganizationOwner(org.id, owner.userId);
      await ctx.admin.updateUser(owner.userId, { name: 'Justin' });

      const adminInvite = await ctx.admin.createInvitation(org.id, { role: 'admin' });
      const admin = await ctx.createActorWithInvitation(
        adminInvite.code,
        `polly-${stamp}@example.com`
      );
      await ctx.admin.updateUser(admin.userId, { name: 'Polly' });

      const pat = await ctx.admin.createUser(org.id, `pat-${stamp}@example.com`, {
        name: 'Pat',
        role: 'admin',
      });
      const libby = await ctx.admin.createUser(org.id, `libby-${stamp}@example.com`, {
        name: 'Libby',
        role: 'member',
      });
      const lane = await ctx.admin.createUser(org.id, `lane-${stamp}@example.com`, {
        kind: 'agent',
        name: 'Lane',
      });
      const laneToken = await ctx.admin.createToken(org.id, lane.id, 'Lane');

      const memberInvite = await ctx.admin.createInvitation(org.id, { role: 'member' });
      const member = await ctx.createActorWithInvitation(
        memberInvite.code,
        `sam-${stamp}@example.com`
      );
      await ctx.admin.updateUser(member.userId, { name: 'Sam' });

      await admin.switchOrganization(org.id);
      await owner.switchOrganization(org.id);
      await member.switchOrganization(org.id);
      return { org, owner, admin, member, pat, libby, lane, laneToken };
    };

    it('lets an admin promote a member and demote an admin', async () => {
      const { admin, libby, pat } = await provisionWorkspace('api-promote');
      const promoted = await admin.changeMemberRole(libby.id, 'admin');
      expect(promoted.role).toBe('admin');
      const demoted = await admin.changeMemberRole(pat.id, 'member');
      expect(demoted.role).toBe('member');
    }, 60_000);

    it('refuses changing your own role, a bot, and the owner', async () => {
      const { admin, owner, lane } = await provisionWorkspace('api-refuse');
      await expect(admin.changeMemberRole(admin.userId, 'member')).rejects.toThrow(ValidationError);
      await expect(admin.changeMemberRole(admin.userId, 'member')).rejects.toThrow(
        CANNOT_CHANGE_OWN_ROLE_MESSAGE
      );
      await expect(admin.changeMemberRole(lane.id, 'admin')).rejects.toThrow(ValidationError);
      await expect(admin.changeMemberRole(lane.id, 'admin')).rejects.toThrow(
        BOT_CANNOT_BE_ADMIN_MESSAGE
      );
      await expect(admin.changeMemberRole(owner.userId, 'admin')).rejects.toThrow(ValidationError);
      await expect(admin.changeMemberRole(owner.userId, 'admin')).rejects.toThrow(
        OWNER_ROLE_LOCKED_MESSAGE
      );
    }, 60_000);

    it('refuses a member trying to change roles, remove, or reissue', async () => {
      const { member, libby, lane } = await provisionWorkspace('api-member');
      await expect(member.changeMemberRole(libby.id, 'admin')).rejects.toThrow(ForbiddenError);
      await expect(member.changeMemberRole(libby.id, 'admin')).rejects.toThrow(
        ROLE_CHANGE_NOT_ALLOWED_MESSAGE
      );
      await expect(member.removeMember(libby.id)).rejects.toThrow(ForbiddenError);
      await expect(member.removeMember(libby.id)).rejects.toThrow(REMOVE_NOT_ALLOWED_MESSAGE);
      await expect(member.reissueAgentToken(lane.id)).rejects.toThrow(ForbiddenError);
      await expect(member.reissueAgentToken(lane.id)).rejects.toThrow(REISSUE_NOT_ALLOWED_MESSAGE);
    }, 60_000);

    it('keeps the owner-row note: handover link for the owner, plain copy for everyone else', async () => {
      const { owner, admin, member } = await provisionWorkspace('owner-row');
      await owner.openOrganizationSettings();
      await owner.shouldSeeOwnerHandoverLink();
      await admin.openOrganizationSettings();
      await admin.shouldSeeOwnerCannotBeRemoved();
      await member.openOrganizationSettings();
      await member.shouldSeeOwnerCannotBeRemoved();
    }, 60_000);

    it('lets an admin reissue a bot token so the old token stops working', async () => {
      const { org, admin, lane, laneToken } = await provisionWorkspace('api-reissue');
      const oldBot = ctx.createActorWithCredentials({
        email: 'Lane',
        userId: lane.id,
        organizationId: org.id,
        token: laneToken.rawToken,
      });
      await oldBot.listMembers();

      const issued = await admin.reissueAgentToken(lane.id);
      await expect(oldBot.listMembers()).rejects.toThrow(UnauthorizedError);

      const newBot = ctx.createActorWithCredentials({
        email: 'Lane',
        userId: lane.id,
        organizationId: org.id,
        token: issued.rawToken,
      });
      const members = await newBot.listMembers();
      expect(members.some((entry) => entry.userId === lane.id)).toBe(true);
    }, 60_000);

    it('walks through change roles, remove admins, and reissue on phone and desktop', async () => {
      for (const viewport of ['phone', 'desktop'] as const) {
        const { admin, member } = await provisionWorkspace(`walk-${viewport}`);
        await setViewport(admin, viewport);
        await admin.openOrganizationSettings();
        await admin.shouldSeeRoleActionOnMember('Libby', MAKE_ADMIN_LABEL);
        await admin.shouldSeeRoleActionOnMember('Pat', MAKE_MEMBER_LABEL);
        await admin.shouldNotSeeRoleActionOnMember('Justin');
        await admin.shouldNotSeeRoleActionOnMember('Lane');
        await admin.shouldNotSeeRoleActionOnMember('Polly');
        await admin.revealMembersSection();
        await admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'admin_members_view',
        });

        await admin.openRoleAction('Libby');
        await admin.frameOpenOverlay(
          viewport === 'desktop' ? '[data-role-menu]' : '[data-role-sheet]'
        );
        await admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'role_menu_member',
        });
        await admin.chooseOpenRoleAction();
        await admin.shouldSeeMemberRole('Libby', 'admin');
        await admin.shouldSeeToast(madeAdminToast('Libby'));
        await admin.frameMemberRow('Libby');
        await admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'after_promote',
          includeToasts: true,
        });

        await admin.openMakeMember('Libby');
        await admin.shouldSeeDemoteConfirm('Libby');
        await admin.frameOpenOverlay('[data-demote-confirm]');
        await admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'demote_confirm',
        });
        await admin.confirmMakeMember();
        await admin.shouldSeeMemberRole('Libby', 'member');
        await admin.shouldSeeToast(madeMemberToast('Libby'));
        await admin.frameMemberRow('Libby');
        await admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'after_demote',
          includeToasts: true,
        });

        await admin.openRemoveMember('Pat');
        await admin.shouldSeeRemoveConfirm('Pat');
        await admin.frameOpenOverlay('[data-remove-confirm]');
        await admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'remove_admin_confirm',
        });
        await admin.confirmRemoveMember('Pat');
        await admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'after_remove',
        });

        await admin.openIssueNewToken('Lane');
        await admin.frameOpenOverlay('[data-reissue-dialog]');
        await admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'reissue_dialog',
        });
        const rawToken = await admin.confirmIssueNewToken();
        expect(rawToken.length).toBeGreaterThan(0);
        await admin.frameOpenOverlay('[data-reissue-dialog]');
        await admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'reissue_result',
        });

        await setViewport(member, viewport);
        await member.openOrganizationSettings();
        await member.shouldNotSeeAnyRoleActions();
        await member.shouldNotSeeAnyRemoveButtons();
        await member.shouldNotSeeAnyReissueButtons();
        await member.revealMembersSection();
        await member.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'member_view',
        });
      }
    }, 240_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Changing member roles - HTTP [${ctx.driverName}]`, () => {
    it('changeMemberRole is not supported in HTTP driver', async () => {
      const actor = await ctx.createActor('http-changerole@example.com');
      const actorWithAllMethods = ctx.createActorWithCredentials({
        email: actor.email,
        userId: actor.userId,
        organizationId: actor.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actorWithAllMethods.changeMemberRole(actor.userId, 'admin')).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
