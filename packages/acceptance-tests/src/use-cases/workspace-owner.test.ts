import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import { OwnerMustTransferError, ValidationError } from '@yoink/acceptance-testing';

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
  });
});
