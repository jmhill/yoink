import type { HttpClient } from '../drivers/index.js';

/**
 * Logs into the admin panel and persists the session cookie.
 * The HttpClient automatically maintains cookies across requests.
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
};

/**
 * Logs out from the admin panel.
 * Clears the session cookie.
 */
export const logoutAdmin = async (client: HttpClient): Promise<void> => {
  await client.post('/admin/logout', {});
};
