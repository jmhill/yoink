import { createApp } from './app.js';
import { loadConfig } from './config/config.js';
import { createDatabase } from './database/database.js';
import { runMigrations } from './database/migrator.js';
import { migrations } from './database/migrations.js';
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

  // Ensure database directory exists (only for file-based databases)
  if (config.database.type === 'sqlite') {
    mkdirSync(dirname(config.database.path), { recursive: true });
  }

  // Create database connection and run migrations
  const database = createDatabase(config.database);
  runMigrations(database.db, migrations);

  // Create shared infrastructure
  const clock = createSystemClock();
  const idGenerator = createUuidGenerator();
  const passwordHasher = createBcryptPasswordHasher();

  // Create auth stores (all using shared database connection)
  const organizationStore = createSqliteOrganizationStore(database.db);
  const userStore = createSqliteUserStore(database.db);
  const tokenStore = createSqliteTokenStore(database.db);

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
  const captureStore = createSqliteCaptureStore(database.db);
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
