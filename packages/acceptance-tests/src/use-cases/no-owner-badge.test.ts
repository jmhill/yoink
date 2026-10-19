import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';

const WALKTHROUGH_STORY = '187-no-owner-badge';

usingDrivers(['http'] as const, (ctx) => {
  describe(`No owner badge API [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('lists an ownerless workspace as no-owner and as has-owner after setOrganizationOwner', async () => {
      const stamp = `${Date.now()}`;
      const garden = await ctx.admin.createOwnerlessWorkspace(`Garden Club ${stamp}`);
      const justin = await ctx.admin.createUser(garden.id, `justin-badge-${stamp}@example.com`, {
        name: 'Justin',
        role: 'member',
      });
      const listed = await ctx.admin.listOrganizations();
      const before = listed.find((item) => item.id === garden.id);
      expect(before?.personal).toBe(false);
      expect(before?.ownerStatus).toEqual({ kind: 'no-owner', expiredInvite: null });

      await ctx.admin.setOrganizationOwner(garden.id, justin.id);
      const after = (await ctx.admin.listOrganizations()).find((item) => item.id === garden.id);
      expect(after?.ownerStatus).toEqual({
        kind: 'has-owner',
        ownerUserId: justin.id,
      });
    });

    it('lists a new email as waiting-for-owner and has-owner after that account exists and is invited again', async () => {
      const stamp = `${Date.now()}`;
      const libbyEmail = `libby-wait-${stamp}@example.com`;
      const garden = await ctx.admin.createOrganization(`Garden Club wait ${stamp}`, {
        ownerEmail: libbyEmail,
      });
      const waiting = (await ctx.admin.listOrganizations()).find((item) => item.id === garden.id);
      expect(waiting?.ownerStatus).toMatchObject({
        kind: 'waiting-for-owner',
        email: libbyEmail,
      });

      const host = await ctx.admin.createOrganization(`host-libby-${stamp}`);
      const libby = await ctx.admin.createUser(host.id, libbyEmail, {
        name: 'Libby',
        role: 'member',
      });
      const assigned = await ctx.admin.issueOwnerInvitation(garden.id, libbyEmail);
      expect(assigned.owner?.id).toBe(libby.id);
      const after = (await ctx.admin.listOrganizations()).find((item) => item.id === garden.id);
      expect(after?.ownerStatus).toEqual({
        kind: 'has-owner',
        ownerUserId: libby.id,
      });
    });

    it('lists an expired owner invite as no-owner with expiredInvite, then waiting after a new link', async () => {
      const stamp = `${Date.now()}`;
      const libbyEmail = `libby-expired-${stamp}@example.com`;
      const garden = await ctx.admin.createOrganization(`Garden Club expired ${stamp}`, {
        ownerEmail: libbyEmail,
      });
      const invite = await ctx.admin.getOwnerInvitation(garden.id);
      await ctx.admin.expireInvitation(invite?.code ?? '');
      const expired = (await ctx.admin.listOrganizations()).find((item) => item.id === garden.id);
      expect(expired?.ownerStatus).toEqual({
        kind: 'no-owner',
        expiredInvite: {
          email: libbyEmail,
          expiredAt: '2020-01-01T00:00:00.000Z',
        },
      });
      const details = await ctx.admin.getOwnerInvitationDetails(garden.id);
      expect(details.ownerInvitation).toBeNull();
      expect(details.expiredOwnerInvitation?.email).toBe(libbyEmail);
      expect(details.personal).toBe(false);

      await ctx.admin.issueOwnerInvitation(garden.id, libbyEmail);
      const waiting = (await ctx.admin.listOrganizations()).find((item) => item.id === garden.id);
      expect(waiting?.ownerStatus).toMatchObject({
        kind: 'waiting-for-owner',
        email: libbyEmail,
      });
    });

    it('lists a personal workspace with an owner as has-owner', async () => {
      const stamp = `${Date.now()}`;
      const host = await ctx.admin.createOrganization(`host-owned-personal-${stamp}`);
      const justin = await ctx.admin.createUser(host.id, `justin-owned-personal-${stamp}@example.com`, {
        name: 'Justin',
        role: 'member',
      });
      const personal = await ctx.admin.createOwnerlessWorkspace(`Justin's Workspace ${stamp}`, {
        personalUserId: justin.id,
      });
      await ctx.admin.setOrganizationOwner(personal.id, justin.id);
      const listed = (await ctx.admin.listOrganizations()).find((item) => item.id === personal.id);
      expect(listed?.personal).toBe(true);
      expect(listed?.ownerStatus).toEqual({
        kind: 'has-owner',
        ownerUserId: justin.id,
      });
    });

    it('lists an ownerless personal workspace fixture with no owner and personal true', async () => {
      const stamp = `${Date.now()}`;
      const host = await ctx.admin.createOrganization(`host-personal-${stamp}`);
      const justin = await ctx.admin.createUser(host.id, `justin-personal-fix-${stamp}@example.com`, {
        name: 'Justin',
        role: 'member',
      });
      const garden = await ctx.admin.createOwnerlessWorkspace(`Garden Club personal ${stamp}`, {
        personalUserId: justin.id,
      });
      const listed = (await ctx.admin.listOrganizations()).find((item) => item.id === garden.id);
      expect(listed?.personal).toBe(true);
      expect(listed?.ownerStatus).toEqual({ kind: 'no-owner', expiredInvite: null });
      const details = await ctx.admin.getOwnerInvitationDetails(garden.id);
      expect(details.personal).toBe(true);
    });
  });
});

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`No owner badge admin panel [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    const captureAdmin = async (step: string) => {
      for (const viewport of ['phone', 'desktop'] as const) {
        if (viewport === 'phone') {
          await ctx.admin.useMobileViewport();
        } else {
          await ctx.admin.useDesktopViewport();
        }
        await ctx.admin.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step,
        });
      }
    };

    it('flags ownerless workspaces, waiting invites, expired invites, and hides personal badges', async () => {
      const stamp = `${Date.now()}`;
      const justinEmail = `justin-${stamp}@example.com`;
      const libbyEmail = `libby-${stamp}@example.com`;
      const expiredEmail = `libby-expired-${stamp}@example.com`;

      const garden = await ctx.admin.createOwnerlessWorkspace('Garden Club');
      const justin = await ctx.admin.createUser(garden.id, justinEmail, {
        name: 'Justin',
        role: 'member',
      });
      const personalWorkspace = await ctx.admin.createOwnerlessWorkspace("Justin's Workspace", {
        personalUserId: justin.id,
      });
      const personalWorkspaceId = personalWorkspace.id;

      await ctx.admin.openOrganizationsList();
      await ctx.admin.shouldSeeOwnerBadge(garden.id, 'no-owner');
      await ctx.admin.frameOrganizationRow(garden.id);
      await captureAdmin('list_no_owner');

      await ctx.admin.clickOwnerBadge(garden.id);
      await ctx.admin.shouldSeeMakeOwner(justin.id);
      await ctx.admin.frameOwnerAndUsers();
      await captureAdmin('owner_section_create_invite');

      await ctx.admin.makeOwner(justin.id);
      await ctx.admin.openOrganizationsList();
      await ctx.admin.shouldSeeNoOwnerBadge(garden.id);
      await ctx.admin.frameOrganizationRow(garden.id);
      await captureAdmin('list_after_make_owner');

      const waitingGarden = await ctx.admin.createOrganization('Garden Club', {
        ownerEmail: libbyEmail,
      });
      await ctx.admin.openOrganizationsList();
      await ctx.admin.shouldSeeOwnerBadge(waitingGarden.id, 'waiting-for-owner');
      await ctx.admin.frameOrganizationRow(waitingGarden.id);
      await captureAdmin('list_waiting');

      await ctx.admin.clickOwnerBadge(waitingGarden.id);
      await ctx.admin.shouldSeePendingOwnerInvite(libbyEmail);
      await ctx.admin.frameOwnerSection();
      await captureAdmin('owner_section_pending');

      const pending = await ctx.admin.getOwnerInvitation(waitingGarden.id);
      const libby = await ctx.createActorWithInvitation(pending?.code ?? '', libbyEmail, {
        exactEmail: true,
      });
      await ctx.admin.updateUser(libby.userId, { name: 'Libby' });
      await ctx.admin.openOrganizationsList();
      await ctx.admin.shouldSeeNoOwnerBadge(waitingGarden.id);
      await ctx.admin.frameOrganizationRow(waitingGarden.id);
      await captureAdmin('list_after_libby_signup');

      const expiredGarden = await ctx.admin.createOrganization('Garden Club', {
        ownerEmail: expiredEmail,
      });
      const expiredInvite = await ctx.admin.getOwnerInvitation(expiredGarden.id);
      await ctx.admin.expireInvitation(expiredInvite?.code ?? '');
      await ctx.admin.openOrganizationsList();
      await ctx.admin.shouldSeeOwnerBadge(expiredGarden.id, 'no-owner');
      await ctx.admin.frameOrganizationRow(expiredGarden.id);
      await captureAdmin('list_expired_no_owner');

      await ctx.admin.clickOwnerBadge(expiredGarden.id);
      await ctx.admin.shouldSeeExpiredOwnerInvite(expiredEmail);
      await ctx.admin.shouldSeeOwnerInviteEmailPrefilled(expiredEmail);
      await ctx.admin.frameOwnerSection();
      await captureAdmin('owner_section_expired');

      await ctx.admin.clickCreateOwnerInvite();
      await ctx.admin.closeOwnerInviteDialog();
      await ctx.admin.openOrganizationsList();
      await ctx.admin.shouldSeeOwnerBadge(expiredGarden.id, 'waiting-for-owner');
      await ctx.admin.frameOrganizationRow(expiredGarden.id);
      await captureAdmin('list_after_one_click_invite');

      const retypeEmail = `libby-retype-${stamp}@example.com`;
      const retypeGarden = await ctx.admin.createOrganization('Garden Club', {
        ownerEmail: `libby-clear-${stamp}@example.com`,
      });
      const retypeInvite = await ctx.admin.getOwnerInvitation(retypeGarden.id);
      await ctx.admin.expireInvitation(retypeInvite?.code ?? '');
      await ctx.admin.openOrganization(retypeGarden.id);
      await ctx.admin.shouldSeeExpiredOwnerInvite(`libby-clear-${stamp}@example.com`);
      await ctx.admin.shouldSeeOwnerInviteEmailPrefilled(`libby-clear-${stamp}@example.com`);
      await ctx.admin.replaceExpiredOwnerInviteEmail(retypeEmail);
      await ctx.admin.closeOwnerInviteDialog();
      await ctx.admin.shouldSeePendingOwnerInvite(retypeEmail);

      await ctx.admin.openOrganizationsList();
      await ctx.admin.shouldSeeNoOwnerBadge(personalWorkspaceId);
      await ctx.admin.frameOrganizationRow(personalWorkspaceId);
      await captureAdmin('list_personal_no_badge');

      await ctx.admin.openOrganization(personalWorkspaceId);
      await ctx.admin.shouldSeeNoCreateOwnerInvite();
      await ctx.admin.shouldSeeMakeOwner(justin.id);
      await ctx.admin.frameOwnerAndUsers();
      await captureAdmin('personal_owner_section');

      const refreshGarden = await ctx.admin.createOwnerlessWorkspace('Garden Club');
      const refreshJustin = await ctx.admin.createUser(refreshGarden.id, `justin-refresh-${stamp}@example.com`, {
        name: 'Justin',
        role: 'member',
      });
      await ctx.admin.openOrganization(refreshGarden.id);
      await ctx.admin.makeOwner(refreshJustin.id);
      await ctx.admin.openOrganizationsList();
      await ctx.admin.shouldSeeNoOwnerBadge(refreshGarden.id);
    }, 300_000);
  });
});
