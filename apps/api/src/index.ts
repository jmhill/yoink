import { createApp } from './app.js';
import { loadConfig, getDatabasePath } from './config/config.js';
import { createCaptureService } from './captures/domain/capture-service.js';
import { createSqliteCaptureStore } from './captures/infrastructure/sqlite-capture-store.js';
import { createTokenService } from './auth/domain/token-service.js';
import { createAuthMiddleware } from './auth/application/auth-middleware.js';
import { createSqliteHealthChecker } from './health/infrastructure/sqlite-health-checker.js';
import {
  createSqliteOrganizationStore,
  createSqliteUserStore,
  createSqliteTokenStore,
  seedAuthData,
} from './auth/infrastructure/index.js';
import {
  createSystemClock,
  createUuidGenerator,
  createBcryptPasswordHasher,
} from '@yoink/infrastructure';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const main = async () => {
  const config = loadConfig();
  const dbPath = getDatabasePath(config.database);

  // Ensure database directory exists (only for file-based databases)
  if (config.database.type === 'sqlite') {
    mkdirSync(dirname(config.database.path), { recursive: true });
  }

  // Create shared infrastructure
  const clock = createSystemClock();
  const idGenerator = createUuidGenerator();
  const passwordHasher = createBcryptPasswordHasher();

  // Create auth stores (all using same db path)
  const organizationStore = createSqliteOrganizationStore({
    location: dbPath,
  });
  const userStore = createSqliteUserStore({ location: dbPath });
  const tokenStore = createSqliteTokenStore({ location: dbPath });

  // Seed auth data if configured
  await seedAuthData({
    seedToken: config.seedToken,
    organizationStore,
    userStore,
    tokenStore,
    passwordHasher,
    idGenerator,
    clock,
  });

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
  const captureStore = createSqliteCaptureStore({ location: dbPath });
  const captureService = createCaptureService({
    store: captureStore,
    clock,
    idGenerator,
  });

  const app = await createApp({ captureService, authMiddleware, healthChecker });

  try {
    const { port, host } = config.server;
    await app.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

main();
