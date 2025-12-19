import type { HttpClient } from './http-client.js';

/**
 * Test DSL (Domain Specific Language) for acceptance tests.
 * Provides high-level helpers that abstract authentication details.
 */

/**
 * Logs into the admin panel and persists the session cookie.
 * Works in both in-process and external container modes.
 */
export const loginToAdminPanel = async (
  client: HttpClient,
  password: string
): Promise<void> => {
  const response = await client.post('/admin/login', { password });
  if (response.statusCode !== 200) {
    throw new Error(
      `Admin login failed with status ${response.statusCode}: ${response.body}`
    );
  }
  // Session cookie is automatically persisted by the HttpClient
};

/**
 * Logs out from the admin panel.
 */
export const logoutAdmin = async (client: HttpClient): Promise<void> => {
  await client.post('/admin/logout', {});
  // Cookie is cleared by the HttpClient
};

/**
 * Represents an isolated test tenant (organization + user + API token).
 */
export type TestTenant = {
  organization: { id: string; name: string; createdAt: string };
  user: { id: string; email: string; organizationId: string; createdAt: string };
  apiToken: string;
};

type CreateTestTenantOptions = {
  orgName?: string;
  userEmail?: string;
  tokenName?: string;
};

/**
 * Creates an isolated tenant for testing.
 * Requires admin session (call loginToAdminPanel first).
 *
 * Each test suite should create its own tenant to avoid data collisions.
 *
 * @example
 * beforeAll(async () => {
 *   const { client, adminPassword } = await createTestContext();
 *   await loginToAdminPanel(client, adminPassword);
 *   tenant = await createTestTenant(client);
 *   await logoutAdmin(client);
 * });
 */
export const createTestTenant = async (
  client: HttpClient,
  options?: CreateTestTenantOptions
): Promise<TestTenant> => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const suffix = `${timestamp}-${random}`;

  const orgName = options?.orgName ?? `test-org-${suffix}`;
  const userEmail = options?.userEmail ?? `test-${suffix}@example.com`;
  const tokenName = options?.tokenName ?? 'test-token';

  // Create organization
  const orgResponse = await client.post('/admin/organizations', {
    name: orgName,
  });
  if (orgResponse.statusCode !== 201) {
    throw new Error(
      `Failed to create org with status ${orgResponse.statusCode}: ${orgResponse.body}`
    );
  }
  const organization = orgResponse.json<TestTenant['organization']>();

  // Create user in the organization
  const userResponse = await client.post(
    `/admin/organizations/${organization.id}/users`,
    { email: userEmail }
  );
  if (userResponse.statusCode !== 201) {
    throw new Error(
      `Failed to create user with status ${userResponse.statusCode}: ${userResponse.body}`
    );
  }
  const user = userResponse.json<TestTenant['user']>();

  // Create API token for the user
  const tokenResponse = await client.post(`/admin/users/${user.id}/tokens`, {
    name: tokenName,
  });
  if (tokenResponse.statusCode !== 201) {
    throw new Error(
      `Failed to create token with status ${tokenResponse.statusCode}: ${tokenResponse.body}`
    );
  }
  const { rawToken } = tokenResponse.json<{ rawToken: string }>();

  return {
    organization,
    user,
    apiToken: rawToken,
  };
};
