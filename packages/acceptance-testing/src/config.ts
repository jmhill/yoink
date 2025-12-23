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
