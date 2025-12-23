import { usingDrivers, describe, it, expect, beforeEach, afterEach } from '@yoink/acceptance-testing';
import { UnauthorizedError } from '@yoink/acceptance-testing';

usingDrivers(['http'] as const, (ctx) => {
  describe(`Authenticating [${ctx.driverName}]`, () => {
    // Make sure we're logged out before each test
    beforeEach(async () => {
      try {
        await ctx.admin.logout();
      } catch {
        // Ignore - might not be logged in
      }
    });

    afterEach(async () => {
      try {
        await ctx.admin.logout();
      } catch {
        // Ignore
      }
    });

    it('can log into the admin panel', async () => {
      await ctx.admin.login();

      const isLoggedIn = await ctx.admin.isLoggedIn();
      expect(isLoggedIn).toBe(true);
    });

    it('can log out of the admin panel', async () => {
      await ctx.admin.login();
      await ctx.admin.logout();

      const isLoggedIn = await ctx.admin.isLoggedIn();
      expect(isLoggedIn).toBe(false);
    });

    it('reports not logged in without session', async () => {
      const isLoggedIn = await ctx.admin.isLoggedIn();

      expect(isLoggedIn).toBe(false);
    });

    it('requires admin session to list organizations', async () => {
      // Create fresh admin that's definitely not logged in
      // This is a bit tricky since we share the admin instance
      // For now, we just verify the logout worked
      const isLoggedIn = await ctx.admin.isLoggedIn();
      expect(isLoggedIn).toBe(false);

      // Try to access without login
      await expect(ctx.admin.listOrganizations()).rejects.toThrow(UnauthorizedError);
    });

    it('rejects login with wrong password', async () => {
      const wrongPasswordAdmin = ctx.createAdminWithCredentials('wrong-password-123');

      await expect(wrongPasswordAdmin.login()).rejects.toThrow(UnauthorizedError);
    });
  });
});
