import { describeFeature, expect } from './harness.js';
import { UnauthorizedError } from '../dsl/index.js';
import { createHttpAdmin } from '../drivers/http/admin.js';
import { createHttpClient } from '../drivers/http/http-client.js';
import { getTestConfig } from '../config.js';

describeFeature('Authenticating', ['http'], ({ admin, it, beforeEach, afterEach }) => {
  // Make sure we're logged out before each test
  beforeEach(async () => {
    try {
      await admin.logout();
    } catch {
      // Ignore - might not be logged in
    }
  });

  afterEach(async () => {
    try {
      await admin.logout();
    } catch {
      // Ignore
    }
  });

  it('can log into the admin panel', async () => {
    await admin.login();

    const isLoggedIn = await admin.isLoggedIn();
    expect(isLoggedIn).toBe(true);
  });

  it('can log out of the admin panel', async () => {
    await admin.login();
    await admin.logout();

    const isLoggedIn = await admin.isLoggedIn();
    expect(isLoggedIn).toBe(false);
  });

  it('reports not logged in without session', async () => {
    const isLoggedIn = await admin.isLoggedIn();

    expect(isLoggedIn).toBe(false);
  });

  it('requires admin session to list organizations', async () => {
    // Create fresh admin that's definitely not logged in
    // This is a bit tricky since we share the admin instance
    // For now, we just verify the logout worked
    const isLoggedIn = await admin.isLoggedIn();
    expect(isLoggedIn).toBe(false);

    // Try to access without login
    await expect(admin.listOrganizations()).rejects.toThrow(UnauthorizedError);
  });

  it('rejects login with wrong password', async () => {
    const config = getTestConfig();
    const client = createHttpClient(config.baseUrl);
    const wrongPasswordAdmin = createHttpAdmin(client, 'wrong-password-123');

    await expect(wrongPasswordAdmin.login()).rejects.toThrow(UnauthorizedError);
  });
});
