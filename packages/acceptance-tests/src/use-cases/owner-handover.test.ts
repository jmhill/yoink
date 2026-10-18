import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import { OwnerMustTransferError } from '@yoink/acceptance-testing';

const WALKTHROUGH_STORY = '190-owner-handover';

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

/**
 * The owner hands over ownership in one save.
 */
usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Owner handover [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    const provisionOwnerWorkspace = async (label: string) => {
      const stamp = `${label}-${Date.now()}`;
      const org = await ctx.admin.createOrganization(`handover-${stamp}`);
      const ownerInvite = await ctx.admin.createInvitation(org.id, { role: 'member' });
      const owner = await ctx.createActorWithInvitation(
        ownerInvite.code,
        `handover-owner-${stamp}@example.com`
      );
      await ctx.admin.setOrganizationOwner(org.id, owner.userId);
      await ctx.admin.updateUser(owner.userId, { name: 'Justin' });
      const nextOwner = await ctx.admin.createUser(org.id, `handover-next-${stamp}@example.com`, {
        name: label === 'admin' ? 'Polly' : 'Libby',
        role: label === 'admin' ? 'admin' : 'member',
      });
      await ctx.admin.createUser(org.id, `handover-lane-${stamp}@example.com`, {
        kind: 'agent',
        name: 'Lane',
      });
      await owner.switchOrganization(org.id);
      return { org, owner, nextOwner, nextName: label === 'admin' ? 'Polly' : 'Libby' };
    };

    it('hands over to a member on phone and desktop', async () => {
      for (const viewport of ['phone', 'desktop'] as const) {
        const { org, owner, nextOwner, nextName } = await provisionOwnerWorkspace(
          `member-${viewport}`
        );
        await setViewport(owner, viewport);
        await owner.openOrganizationSettings();
        await owner.shouldSeeOwnershipCard('Justin');
        await owner.frameOwnershipCard();
        await owner.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'card' });

        await owner.openHandOverOwnership();
        await owner.shouldSeeHandoverCandidate(nextName);
        await owner.shouldNotSeeHandoverCandidate('Lane');
        await owner.shouldNotSeeHandoverCandidate('Justin');
        await owner.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'picker' });

        await owner.pickHandoverCandidate(nextName);
        await owner.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'confirm' });
        await owner.confirmHandover();
        await owner.shouldNotSeeOwnershipCard();
        await owner.revealMembersSection();
        await owner.saveWalkthroughScreenshot({ story: WALKTHROUGH_STORY, step: 'after_handover' });

        const users = await ctx.admin.listUsers(org.id);
        expect(users.find((entry) => entry.id === nextOwner.id)?.role).toBe('owner');
        expect(users.find((entry) => entry.id === owner.userId)?.role).toBe('admin');
      }
    }, 180_000);

    it('hands over to an admin', async () => {
      const { org, owner, nextOwner, nextName } = await provisionOwnerWorkspace('admin');
      await owner.openOrganizationSettings();
      await owner.shouldSeeOwnershipCard('Justin');
      await owner.openHandOverOwnership();
      await owner.shouldSeeHandoverCandidate(nextName);
      await owner.pickHandoverCandidate(nextName);
      await owner.confirmHandover();

      const users = await ctx.admin.listUsers(org.id);
      expect(users.find((entry) => entry.id === nextOwner.id)?.role).toBe('owner');
      expect(users.find((entry) => entry.id === owner.userId)?.role).toBe('admin');
    }, 120_000);

    it('shows no card for a non-owner or a personal workspace', async () => {
      const stamp = Date.now();
      const org = await ctx.admin.createOrganization(`handover-hidden-${stamp}`);
      const ownerUser = await ctx.admin.createUser(org.id, `hidden-owner-${stamp}@example.com`, {
        name: 'Owner Pat',
        role: 'member',
      });
      await ctx.admin.setOrganizationOwner(org.id, ownerUser.id);

      const memberInvite = await ctx.admin.createInvitation(org.id, { role: 'member' });
      const member = await ctx.createActorWithInvitation(
        memberInvite.code,
        `hidden-member-${stamp}@example.com`
      );
      await member.switchOrganization(org.id);
      await member.openOrganizationSettings();
      await member.shouldNotSeeOwnershipCard();

      const personal = await ctx.createActor(`personal-${stamp}@example.com`);
      await personal.openOrganizationSettings();
      await personal.shouldNotSeeOwnershipCard();
    }, 120_000);

    it('lets the old owner leave after handover', async () => {
      for (const viewport of ['phone', 'desktop'] as const) {
        const { org, owner, nextName } = await provisionOwnerWorkspace(`leave-${viewport}`);
        await setViewport(owner, viewport);
        await owner.openOrganizationSettings();
        await owner.openHandOverOwnership();
        await owner.pickHandoverCandidate(nextName);
        await owner.confirmHandover();
        await owner.leaveOrganizationFromSettings(org.name);
        await owner.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'old_owner_leaving',
        });
      }
    }, 180_000);

    it('links the Leave refusal and the owner note to the handover card', async () => {
      const { org, owner } = await provisionOwnerWorkspace('link');
      await expect(owner.leaveOrganization(org.id)).rejects.toThrow(OwnerMustTransferError);

      for (const viewport of ['phone', 'desktop'] as const) {
        await setViewport(owner, viewport);
        await owner.tryLeaveOrganizationFromSettings(org.name);
        await owner.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'leave_refusal',
        });
        await owner.followHandoverLink();
        await owner.shouldSeeOwnershipCard('Justin');
      }

      const adminInvite = await ctx.admin.createInvitation(org.id, { role: 'admin' });
      const workspaceAdmin = await ctx.createActorWithInvitation(
        adminInvite.code,
        `handover-link-admin-${Date.now()}@example.com`
      );
      await workspaceAdmin.switchOrganization(org.id);

      for (const viewport of ['phone', 'desktop'] as const) {
        await setViewport(workspaceAdmin, viewport);
        await workspaceAdmin.openOrganizationSettings();
        await workspaceAdmin.shouldSeeOwnerCannotBeRemoved();
        await workspaceAdmin.frameOwnerCannotBeRemoved();
        await workspaceAdmin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'owner_note',
        });
      }
    }, 180_000);
  });
});
