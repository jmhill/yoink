import { createApp } from './app.js';
import { loadConfig } from './config/config.js';
import { createCaptureService } from './captures/domain/capture-service.js';
import { createSqliteCaptureStore } from './captures/infrastructure/sqlite-capture-store.js';
import { createTokenService } from './auth/domain/token-service.js';
import { createAuthMiddleware } from './auth/application/auth-middleware.js';
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

  // Ensure database directory exists
  mkdirSync(dirname(config.dbPath), { recursive: true });

  // Create shared infrastructure
  const clock = createSystemClock();
  const idGenerator = createUuidGenerator();
  const passwordHasher = createBcryptPasswordHasher();

  // Create auth stores (all using same db path)
  const organizationStore = createSqliteOrganizationStore({
    location: config.dbPath,
  });
  const userStore = createSqliteUserStore({ location: config.dbPath });
  const tokenStore = createSqliteTokenStore({ location: config.dbPath });

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

  // Create capture store and service
  const captureStore = createSqliteCaptureStore({ location: config.dbPath });
  const captureService = createCaptureService({
    store: captureStore,
    clock,
    idGenerator,
  });

  const app = await createApp({ captureService, authMiddleware });

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`Server running at http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

main();
