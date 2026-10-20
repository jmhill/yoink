import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import { ValidationError } from '@yoink/acceptance-testing';
import type { Actor } from '@yoink/acceptance-testing';
import {
  INVITE_WRONG_EMAIL_HINT,
  OWNER_INVITE_WRONG_EMAIL_MESSAGE,
} from '@yoink/api-contracts';

const WALKTHROUGH_STORY = '188-invite-lock';

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
  describe(`Invite email lock [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('refuses the wrong email, keeps the invite unused, and lets the right email join', async () => {
      const stamp = `${Date.now()}`;
      const host = await ctx.createActor(`host-lock-${stamp}@example.com`);
      await host.switchOrganization(host.organizationId);
      const libby = await ctx.createActor(`libby-lock-${stamp}@example.com`);
      const interloper = await ctx.createActor(`other-lock-${stamp}@example.com`);
      const locked = await host.createInvitation({
        role: 'admin',
        email: libby.email,
      });

      const captureOn = async (
        actor: Actor,
        step: string,
        run: () => Promise<void>
      ) => {
        for (const viewport of ['phone', 'desktop'] as const) {
          await actor.goToSettings();
          await setViewport(actor, viewport);
          await run();
          await actor.saveWalkthroughScreenshot({
            story: WALKTHROUGH_STORY,
            step,
          });
        }
      };

      await captureOn(interloper, 'join_wrong_email', async () => {
        await interloper.openJoin(locked.code);
        await interloper.shouldSeeInvitationError(OWNER_INVITE_WRONG_EMAIL_MESSAGE);
        await interloper.shouldSeeInvitationErrorHint(INVITE_WRONG_EMAIL_HINT);
        await interloper.shouldNotSeeJoinButton();
      });

      await expect(interloper.acceptInvitation(locked.code)).rejects.toBeInstanceOf(
        ValidationError
      );

      await ctx.admin.openUnsignedSignup(locked.code);
      await ctx.admin.fillUnsignedSignupEmail(`wrong-${stamp}@example.com`);
      await ctx.admin.submitUnsignedSignup();
      await ctx.admin.shouldSeeUnsignedSignupText(OWNER_INVITE_WRONG_EMAIL_MESSAGE);
      await ctx.admin.shouldSeeUnsignedSignupText(INVITE_WRONG_EMAIL_HINT);
      for (const viewport of ['phone', 'desktop'] as const) {
        await setViewport(ctx.admin, viewport);
        await ctx.admin.saveUnsignedWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'signup_wrong_email',
        });
      }

      await host.openOrganizationSettings();
      await host.shouldSeePendingInvitation(locked.code);
      const pending = await host.listPendingInvitations();
      expect(pending.some((invitation) => invitation.code === locked.code)).toBe(true);
      for (const viewport of ['phone', 'desktop'] as const) {
        await setViewport(host, viewport);
        await host.openOrganizationSettings();
        await host.shouldSeePendingInvitation(locked.code);
        await host.frameInvitationsCard();
        await host.saveWalkthroughScreenshot({
          story: WALKTHROUGH_STORY,
          step: 'pending_after_failed_join',
        });
      }

      await captureOn(libby, 'join_right_email', async () => {
        await libby.openJoin(locked.code);
        await libby.shouldSeeJoinRole('admin');
      });
      const joined = await libby.acceptInvitation(locked.code);
      expect(joined.role).toBe('admin');
      expect(joined.organizationId).toBe(host.organizationId);

      const open = await host.createInvitation({ role: 'member' });
      const anyone = await ctx.createActor(`open-lock-${stamp}@example.com`);
      await captureOn(anyone, 'join_open_invite', async () => {
        await anyone.openJoin(open.code);
        await anyone.shouldSeeJoinRole('member');
      });
      const openJoined = await anyone.acceptInvitation(open.code);
      expect(openJoined.role).toBe('member');
      expect(openJoined.organizationId).toBe(host.organizationId);
    });
  });
});
