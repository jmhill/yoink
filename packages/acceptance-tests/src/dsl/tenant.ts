import type { HttpClient } from '../drivers/index.js';

/**
 * Represents an isolated test tenant (organization + user + API token).
 * Each test suite should create its own tenant to avoid data collisions.
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
