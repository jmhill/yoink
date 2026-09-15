import { usingDrivers, describe, it, expect, beforeAll, afterAll } from '@yoink/acceptance-testing';
import type { BrowserActor, PlaywrightContext } from '@yoink/acceptance-testing';
import { UnsupportedOperationError } from '@yoink/acceptance-testing';

/**
 * Live blocker (Justin, 2026-09-15): after joining a second org the header
 * org switcher showed a chevron, but clicking it did nothing — kit
 * DropdownMenu never produced a usable picker (same family as named-list
 * ⋯ / snooze: clipped or buried by header overflow / z-50 rail / Vaul).
 *
 * Product: chevron opens the picker; picking another org switches and
 * sticks; switch failure shows a toast, not a silent isSwitching reset.
 *
 * Out of scope: PWA /admin SW denylist, seeding Polly UX data, lifecycle.
 */

const joinPollyUx = async (
  ctx: PlaywrightContext,
  email: string
): Promise<{ actor: BrowserActor; pollyId: string; personalName: string }> => {
  const actor = await ctx.createActor(email);
  const polly = await ctx.admin.createOrganization('Polly UX');
  const invitation = await ctx.admin.createInvitation(polly.id, { role: 'member' });
  await actor.acceptInvitation(invitation.code);

  const session = await actor.getSessionInfo();
  const personal = session.organizations.find((org) => org.isPersonal);
  if (!personal) {
    throw new Error('expected a personal organization after signup');
  }

  return { actor, pollyId: polly.id, personalName: personal.name };
};

usingDrivers(['playwright'] as const, (ctx) => {
  describe(`Header org switcher [${ctx.driverName}]`, () => {
    beforeAll(async () => {
      await ctx.admin.login();
    });

    afterAll(async () => {
      await ctx.admin.logout();
    });

    it('opens the picker from the header chevron and switches org on desktop Inbox', async () => {
      const { actor: justin, pollyId, personalName } = await joinPollyUx(
        ctx,
        'justin-org-switcher-desktop@example.com'
      );

      await justin.useDesktopViewport();
      await justin.listCaptures();
      await justin.shouldSeeCurrentOrganizationInHeader('Polly UX');

      const session = await justin.getSessionInfo();
      expect(session.organizationId).toBe(pollyId);
      await justin.shouldOpenOrgSwitcherPicker(session.organizations.map((org) => org.name));

      await justin.pickOrganizationFromHeader(personalName);
      const after = await justin.getSessionInfo();
      expect(after.organizationId).not.toBe(pollyId);
      await justin.shouldSeeCurrentOrganizationInHeader(personalName);
    }, 90_000);

    it('opens the picker from the Tasks header on a phone layout', async () => {
      const { actor: justin, personalName } = await joinPollyUx(
        ctx,
        'justin-org-switcher-mobile@example.com'
      );

      await justin.useMobileViewport();
      await justin.openToday();
      await justin.shouldSeeCurrentOrganizationInHeader('Polly UX');

      const session = await justin.getSessionInfo();
      await justin.shouldOpenOrgSwitcherPicker(session.organizations.map((org) => org.name));

      await justin.pickOrganizationFromHeader(personalName);
      const after = await justin.getSessionInfo();
      expect(after.organizations.some((org) => org.id === after.organizationId && org.name === personalName)).toBe(
        true
      );
      await justin.shouldSeeCurrentOrganizationInHeader(personalName);
    }, 90_000);

    it('shows a toast when switching from the header fails', async () => {
      const { actor: justin, pollyId, personalName } = await joinPollyUx(
        ctx,
        'justin-org-switcher-toast@example.com'
      );

      await justin.useDesktopViewport();
      await justin.listCaptures();
      await justin.shouldSeeCurrentOrganizationInHeader('Polly UX');

      await justin.shouldSeeOrgSwitchFailureToast(personalName);

      const after = await justin.getSessionInfo();
      expect(after.organizationId).toBe(pollyId);
      await justin.shouldSeeCurrentOrganizationInHeader('Polly UX');
    }, 90_000);
  });
});

usingDrivers(['http'] as const, (ctx) => {
  describe(`Header org switcher — HTTP stubs [${ctx.driverName}]`, () => {
    it('stubs header org-switcher operations as browser-only', async () => {
      const alice = await ctx.createActor('alice-org-switcher-http@example.com');
      const actor = ctx.createActorWithCredentials({
        email: alice.email,
        userId: alice.userId,
        organizationId: alice.organizationId,
        token: 'any-token',
      }) as BrowserActor;

      await expect(actor.shouldOpenOrgSwitcherPicker(['Polly UX'])).rejects.toThrow(
        UnsupportedOperationError
      );
    });
  });
});
