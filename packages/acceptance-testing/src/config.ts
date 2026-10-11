export type TestConfig = {
  baseUrl: string;
  adminPassword: string;
};

/**
 * Gets test configuration from environment variables.
 *
 * Required environment variables:
 * - TEST_BASE_URL: Base URL of the system under test (e.g., http://localhost:3333)
 * - TEST_ADMIN_PASSWORD: Admin password for the system under test
 *
 * Playwright display names are a test-only DB write (not an admin route):
 * - TEST_DB_PATH: local SQLite file the test process can UPDATE
 * - TEST_DB_COMPOSE_FILE: docker compose file so E2E can exec into the API container
 */
export const getTestConfig = (): TestConfig => {
  const baseUrl = process.env.TEST_BASE_URL;
  const adminPassword = process.env.TEST_ADMIN_PASSWORD;

  if (!baseUrl) {
    throw new Error(
      'TEST_BASE_URL environment variable is required. ' +
      'Set it to the base URL of the system under test (e.g., http://localhost:3333)'
    );
  }

  if (!adminPassword) {
    throw new Error(
      'TEST_ADMIN_PASSWORD environment variable is required. ' +
      'Set it to the admin password for the system under test.'
    );
  }

  return { baseUrl, adminPassword };
};
