import { createApp } from '../../app.js';
import { createCaptureService } from '../../captures/domain/capture-service.js';
import { createSqliteCaptureStore } from '../../captures/infrastructure/sqlite-capture-store.js';
import { createTokenService } from '../../auth/domain/token-service.js';
import { createAuthMiddleware } from '../../auth/application/auth-middleware.js';
import { createSqliteHealthChecker } from '../../health/infrastructure/sqlite-health-checker.js';
import {
  createSqliteOrganizationStore,
  createSqliteUserStore,
  createSqliteTokenStore,
} from '../../auth/infrastructure/index.js';
import {
  createFakeClock,
  createFakeIdGenerator,
  createFakePasswordHasher,
} from '@yoink/infrastructure';
import type { Organization } from '../../auth/domain/organization.js';
import type { User } from '../../auth/domain/user.js';
import type { ApiToken } from '../../auth/domain/api-token.js';

const TEST_TOKEN_ID = '550e8400-e29b-41d4-a716-446655440003';
const TEST_TOKEN_SECRET = 'test-token-for-acceptance';
export const TEST_TOKEN = `${TEST_TOKEN_ID}:${TEST_TOKEN_SECRET}`;

export const TEST_ORG: Organization = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Organization',
  createdAt: '2024-01-01T00:00:00.000Z',
};

export const TEST_USER: User = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  organizationId: TEST_ORG.id,
  email: 'test@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

export const createTestApp = async () => {
  const clock = createFakeClock(new Date('2025-01-15T10:00:00.000Z'), {
    autoAdvanceMs: 1000, // Advance 1 second on each call for ordering tests
  });
  const idGenerator = createFakeIdGenerator();
  const passwordHasher = createFakePasswordHasher();

  // Create auth stores with in-memory databases
  const organizationStore = createSqliteOrganizationStore({
    location: ':memory:',
  });
  const userStore = createSqliteUserStore({ location: ':memory:' });
  const tokenStore = createSqliteTokenStore({ location: ':memory:' });

  // Seed test data
  await organizationStore.save(TEST_ORG);
  await userStore.save(TEST_USER);

  const testTokenEntity: ApiToken = {
    id: TEST_TOKEN_ID,
    userId: TEST_USER.id,
    tokenHash: `fake-hash:${TEST_TOKEN_SECRET}`,
    name: 'test-token',
    createdAt: '2024-01-01T00:00:00.000Z',
  };
  await tokenStore.save(testTokenEntity);

  // Create token service
  const tokenService = createTokenService({
    organizationStore,
    userStore,
    tokenStore,
    passwordHasher,
    clock,
  });

  // Create auth middleware
  const authMiddleware = createAuthMiddleware({ tokenService });

  // Create health checker
  const healthChecker = createSqliteHealthChecker({ tokenStore });

  // Create capture store and service
  const captureStore = createSqliteCaptureStore({ location: ':memory:' });
  const captureService = createCaptureService({
    store: captureStore,
    clock,
    idGenerator,
  });

  const app = await createApp({ captureService, authMiddleware, healthChecker });

  return app;
};
