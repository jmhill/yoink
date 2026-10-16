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
    });

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

        if (viewport === 'phone') {
          await ctx.admin.useMobileViewport();
        } else {
          await ctx.admin.useDesktopViewport();
        }

        await ctx.admin.openOrganization(org.id);
        await ctx.admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'admin_before_no_owner',
        });

        await ctx.admin.makeOwner(justin.id);
        await ctx.admin.shouldSeeMemberRole(justin.id, 'owner');
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

        await ctx.admin.makeAdmin(lane.id);
        await ctx.admin.shouldSeeMemberError(lane.id, /cannot be an admin/i);
        await ctx.admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'bot_admin_refusal',
        });
      };

      await drivePanel('phone');
      await drivePanel('desktop');
    }, 120_000);
  });
});
