import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import { ValidationError } from '@yoink/acceptance-testing';
import type { Actor } from '@yoink/acceptance-testing';
import {
  INVITATION_ALREADY_USED_MESSAGE,
  INVITATION_EXPIRED_MESSAGE,
  INVITATION_NOT_FOUND_MESSAGE,
  INVITATION_REPLACED_MESSAGE,
  OWNER_INVITE_WRONG_EMAIL_MESSAGE,
  WORKSPACE_ALREADY_HAS_OWNER_MESSAGE,
  ownerInviteJoinTitle,
  YOUR_ROLE_OWNER_LABEL,
} from '@yoink/api-contracts';

const WALKTHROUGH_STORY = '186-owner-invite';

usingDrivers(['http'] as const, (ctx) => {
  describe(`Owner invites API [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('creates a workspace for an existing user and they can mint a bot', async () => {
      const stamp = `${Date.now()}`;
      const host = await ctx.admin.createOrganization(`host-${stamp}`);
      const justin = await ctx.admin.createUser(host.id, `justin-owner-${stamp}@example.com`, {
        name: 'Justin',
        role: 'member',
      });
      const garden = await ctx.admin.createOrganization(`Garden Club ${stamp}`, {
        ownerEmail: justin.email,
      });
      const users = await ctx.admin.listUsers(garden.id);
      expect(users.find((user) => user.id === justin.id)?.role).toBe('owner');
      expect(await ctx.admin.getOwnerInvitation(garden.id)).toBeNull();

      const agent = await ctx.admin.createUser(garden.id, `lane-${stamp}@example.com`, {
        kind: 'agent',
        role: 'member',
        name: 'Lane',
      });
      expect(agent.kind).toBe('agent');
    });

    it('creates an owner invite for a new email and replaces it', async () => {
      const stamp = `${Date.now()}`;
      const garden = await ctx.admin.createOrganization(`Garden Club ${stamp}`, {
        ownerEmail: `libby-${stamp}@example.com`,
      });
      const first = await ctx.admin.getOwnerInvitation(garden.id);
      expect(first?.email).toBe(`libby-${stamp}@example.com`);

      const next = await ctx.admin.issueOwnerInvitation(garden.id, `libby-${stamp}@example.com`);
      expect(next.ownerInvitation?.code).not.toBe(first?.code);

      const different = await ctx.admin.issueOwnerInvitation(
        garden.id,
        `other-${stamp}@example.com`
      );
      expect(different.ownerInvitation?.email).toBe(`other-${stamp}@example.com`);
    });

    it('assigns owner immediately when a later invite email already has an account', async () => {
      const stamp = `${Date.now()}`;
      const host = await ctx.admin.createOrganization(`host-existing-${stamp}`);
      const justin = await ctx.admin.createUser(host.id, `justin-later-${stamp}@example.com`, {
        name: 'Justin',
        role: 'member',
      });
      const garden = await ctx.admin.createOrganization(`Garden Club ${stamp}`, {
        ownerEmail: `pending-${stamp}@example.com`,
      });
      const assigned = await ctx.admin.issueOwnerInvitation(garden.id, justin.email);
      expect(assigned.owner?.id).toBe(justin.id);
      expect(assigned.ownerInvitation).toBeNull();
      const users = await ctx.admin.listUsers(garden.id);
      expect(users.find((user) => user.id === justin.id)?.role).toBe('owner');
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Owner invites panel [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('walks through owner email, owner invite, and refusals', async () => {
      const stamp = `${Date.now()}`;
      const justinEmail = 'justin@example.com';
      const libbyEmail = 'libby@example.com';
      const host = await ctx.admin.createOrganization(`host-${stamp}`);
      const justin = await ctx.admin.createUser(host.id, justinEmail, {
        name: 'Justin',
        role: 'member',
      });

      const captureAdmin = async (step: string, includeToasts?: boolean) => {
        for (const viewport of ['phone', 'desktop'] as const) {
          if (viewport === 'phone') {
            await ctx.admin.useMobileViewport();
          } else {
            await ctx.admin.useDesktopViewport();
          }
          await ctx.admin.saveWalkthroughScreenshot({
            story: WALKTHROUGH_STORY,
            step,
            includeToasts,
          });
        }
      };

      await ctx.admin.openCreateWorkspace();
      await ctx.admin.fillCreateWorkspace({
        name: 'Garden Club',
        ownerEmail: justinEmail,
      });
      await captureAdmin('create_dialog_filled');
      await ctx.admin.submitCreateWorkspace();
      await ctx.admin.shouldSeeOwnerAssignedToast('Justin', 'Garden Club');
      await ctx.admin.shouldSeeOwner('Justin');
      await captureAdmin('owner_assigned', true);

      await ctx.admin.openCreateWorkspace();
      await ctx.admin.fillCreateWorkspace({
        name: 'Garden Club',
        ownerEmail: libbyEmail,
      });
      await ctx.admin.submitCreateWorkspace();
      await ctx.admin.shouldSeeOwnerInviteCreated(libbyEmail);
      await captureAdmin('invite_link_dialog');
      await ctx.admin.closeOwnerInviteDialog();
      await ctx.admin.shouldSeePendingOwnerInvite(libbyEmail);
      await captureAdmin('pending_invite');

      const inviteOrgs = await ctx.admin.listOrganizations();
      let libbyOrg: (typeof inviteOrgs)[number] | undefined;
      for (const organization of inviteOrgs) {
        const invitation = await ctx.admin.getOwnerInvitation(organization.id);
        if (invitation?.email === libbyEmail) {
          libbyOrg = organization;
          break;
        }
      }
      expect(libbyOrg).toBeDefined();
      const pending = libbyOrg
        ? await ctx.admin.getOwnerInvitation(libbyOrg.id)
        : null;
      expect(pending?.email).toBe(libbyEmail);

      const captureUnsignedCurrent = async (step: string) => {
        for (const viewport of ['phone', 'desktop'] as const) {
          if (viewport === 'phone') {
            await ctx.admin.useMobileViewport();
          } else {
            await ctx.admin.useDesktopViewport();
          }
          await ctx.admin.saveUnsignedWalkthroughScreenshot({
            story: WALKTHROUGH_STORY,
            step,
          });
        }
      };

      const captureJoinRefusal = async (input: {
        actor: Actor;
        code: string;
        step: string;
        message: string;
        clickJoin?: boolean;
      }) => {
        for (const viewport of ['phone', 'desktop'] as const) {
          await input.actor.goToSettings();
          if (viewport === 'phone') {
            await input.actor.useMobileViewport();
          } else {
            await input.actor.useDesktopViewport();
          }
          await input.actor.openJoin(input.code);
          if (input.clickJoin) {
            await input.actor.clickJoin();
          }
          await input.actor.shouldSeeInvitationError(input.message);
          await input.actor.saveWalkthroughScreenshot({
            story: WALKTHROUGH_STORY,
            step: input.step,
          });
        }
      };

      await ctx.admin.openUnsignedSignup(pending?.code ?? '');
      await ctx.admin.shouldSeeUnsignedSignupText(ownerInviteJoinTitle('Garden Club'));
      await ctx.admin.shouldSeeUnsignedSignupText(YOUR_ROLE_OWNER_LABEL);
      await captureUnsignedCurrent('signup_owner_title');

      await ctx.admin.openUnsignedSignup(pending?.code ?? '');
      await ctx.admin.fillUnsignedSignupEmail(`wrong-${stamp}@example.com`);
      await ctx.admin.submitUnsignedSignup();
      await ctx.admin.shouldSeeUnsignedSignupText(OWNER_INVITE_WRONG_EMAIL_MESSAGE);
      await captureUnsignedCurrent('wrong_email');

      const libby = await ctx.createActorWithInvitation(pending?.code ?? '', libbyEmail, {
        exactEmail: true,
      });
      await ctx.admin.updateUser(libby.userId, { name: 'Libby' });
      await libby.switchOrganization(libbyOrg?.id ?? '');
      await libby.openOrganizationSettings();
      await libby.shouldSeeOwnershipCard('Libby');
      for (const viewport of ['phone', 'desktop'] as const) {
        if (viewport === 'phone') {
          await libby.useMobileViewport();
        } else {
          await libby.useDesktopViewport();
        }
        await libby.openOrganizationSettings();
        await libby.frameOwnershipCard();
        await libby.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'settings_owner',
        });
      }

      const replacedOrg = await ctx.admin.createOrganization(`Garden Club replaced ${stamp}`, {
        ownerEmail: `replace-${stamp}@example.com`,
      });
      await ctx.admin.openOrganization(replacedOrg.id);
      const oldInvite = await ctx.admin.getOwnerInvitation(replacedOrg.id);
      await ctx.admin.clickNewOwnerLink();
      await captureAdmin('new_link_confirm');
      await ctx.admin.confirmNewOwnerLink();
      await ctx.admin.shouldSeeOwnerInviteCreated(`replace-${stamp}@example.com`);
      await ctx.admin.closeOwnerInviteDialog();
      await ctx.admin.shouldSeePendingOwnerInvite(`replace-${stamp}@example.com`);

      await captureJoinRefusal({
        actor: libby,
        code: oldInvite?.code ?? '',
        step: 'invite_replaced',
        message: INVITATION_REPLACED_MESSAGE,
      });

      await captureJoinRefusal({
        actor: libby,
        code: pending?.code ?? '',
        step: 'invite_already_used',
        message: INVITATION_ALREADY_USED_MESSAGE,
      });

      const expiredOrg = await ctx.admin.createOrganization(`Garden Club expired ${stamp}`, {
        ownerEmail: `expired-${stamp}@example.com`,
      });
      const expiredInvite = await ctx.admin.getOwnerInvitation(expiredOrg.id);
      await ctx.admin.expireInvitation(expiredInvite?.code ?? '');
      await captureJoinRefusal({
        actor: libby,
        code: expiredInvite?.code ?? '',
        step: 'invite_expired',
        message: INVITATION_EXPIRED_MESSAGE,
      });

      const wrongJoinOrg = await ctx.admin.createOrganization(
        `Garden Club join-email ${stamp}`,
        { ownerEmail: `join-wrong-${stamp}@example.com` }
      );
      const wrongJoinInvite = await ctx.admin.getOwnerInvitation(wrongJoinOrg.id);
      await captureJoinRefusal({
        actor: libby,
        code: wrongJoinInvite?.code ?? '',
        step: 'join_wrong_email',
        message: OWNER_INVITE_WRONG_EMAIL_MESSAGE,
        clickJoin: true,
      });

      const alreadyOwnerEmail = `already-owner-${stamp}@example.com`;
      const alreadyOrg = await ctx.admin.createOrganization(`Garden Club already ${stamp}`, {
        ownerEmail: alreadyOwnerEmail,
      });
      const alreadyInvite = await ctx.admin.getOwnerInvitation(alreadyOrg.id);
      await ctx.admin.assignOwnerKeepingInvite(alreadyOrg.id, justin.id);
      const memberInvite = await ctx.admin.createInvitation(host.id, { role: 'member' });
      const matching = await ctx.createActorWithInvitation(
        memberInvite.code,
        alreadyOwnerEmail,
        { exactEmail: true }
      );
      await captureJoinRefusal({
        actor: matching,
        code: alreadyInvite?.code ?? '',
        step: 'join_already_has_owner',
        message: WORKSPACE_ALREADY_HAS_OWNER_MESSAGE,
        clickJoin: true,
      });

      await ctx.admin.clickUseDifferentEmail();
      await ctx.admin.submitDifferentOwnerEmail(`new-${stamp}@example.com`);
      await ctx.admin.shouldSeeOwnerInviteCreated(`new-${stamp}@example.com`);
      await ctx.admin.closeOwnerInviteDialog();
      await ctx.admin.shouldSeePendingOwnerInvite(`new-${stamp}@example.com`);

      const ownerless = await ctx.admin.createOwnerlessWorkspace('Garden Club');
      await ctx.admin.openOrganization(ownerless.id);
      await ctx.admin.clickCreateOwnerInvite();
      await captureAdmin('create_owner_invite');
      await ctx.admin.submitCreateOwnerInvite(`ownerless-${stamp}@example.com`);
      await ctx.admin.closeOwnerInviteDialog();
      await ctx.admin.shouldSeePendingOwnerInvite(`ownerless-${stamp}@example.com`);

      await captureJoinRefusal({
        actor: libby,
        code: 'BADCODE1',
        step: 'join_not_found',
        message: INVITATION_NOT_FOUND_MESSAGE,
      });
    }, 300_000);

    it('lets the matching email accept an owner invite and refuses a different email', async () => {
      const stamp = `${Date.now()}`;
      const libbyEmail = `libby-accept-${stamp}@example.com`;
      const org = await ctx.admin.createOrganization(`Garden Club accept ${stamp}`, {
        ownerEmail: libbyEmail,
      });
      const invite = await ctx.admin.getOwnerInvitation(org.id);
      expect(invite?.code).toBeDefined();

      await expect(
        ctx.createActorWithInvitation(invite?.code ?? '', `wrong-${stamp}@example.com`, {
          exactEmail: true,
        })
      ).rejects.toThrow();

      const still = await ctx.admin.getOwnerInvitation(org.id);
      expect(still?.code).toBe(invite?.code);

      const libby = await ctx.createActorWithInvitation(invite?.code ?? '', libbyEmail, {
        exactEmail: true,
      });
      await libby.switchOrganization(org.id);
      const minted = await libby.mintAgent('Lane');
      expect(minted.agent.kind).toBe('agent');
      expect(await ctx.admin.getOwnerInvitation(org.id)).toBeNull();
    }, 120_000);

    it('marks a pending owner invite replaced when Make owner runs', async () => {
      const stamp = `${Date.now()}`;
      const org = await ctx.admin.createOrganization(`Garden Club make-owner ${stamp}`, {
        ownerEmail: `pending-${stamp}@example.com`,
      });
      const invite = await ctx.admin.getOwnerInvitation(org.id);
      const member = await ctx.admin.createUser(org.id, `member-${stamp}@example.com`, {
        name: 'Justin',
        role: 'member',
      });
      await ctx.admin.setOrganizationOwner(org.id, member.id);
      expect(await ctx.admin.getOwnerInvitation(org.id)).toBeNull();

      await expect(
        ctx.createActorWithInvitation(invite?.code ?? '', `pending-${stamp}@example.com`, {
          exactEmail: true,
        })
      ).rejects.toThrow(ValidationError);
    }, 120_000);
  });
});
