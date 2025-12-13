import type { DatabaseSync } from 'node:sqlite';
import { createApp, type AdminConfig } from './app.js';
import type { AppConfig } from './config/schema.js';
import { createDatabase } from './database/database.js';
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
  createAdminSessionService,
  createAdminService,
} from './admin/domain/index.js';
import {
  createSystemClock,
  createFakeClock,
  createUuidGenerator,
  createFakeIdGenerator,
  createBcryptPasswordHasher,
  createFakePasswordHasher,
  type Clock,
  type IdGenerator,
  type PasswordHasher,
} from '@yoink/infrastructure';

export type Infrastructure = {
  database: { db: DatabaseSync };
  clock: Clock;
  idGenerator: IdGenerator;
  passwordHasher: PasswordHasher;
};

const createClock = (config: AppConfig['infrastructure']['clock']): Clock => {
  switch (config.type) {
    case 'system':
      return createSystemClock();
    case 'fake':
      return createFakeClock(config.startTime ?? new Date(), {
        autoAdvanceMs: config.autoAdvanceMs,
      });
  }
};

const createIdGenerator = (
  config: AppConfig['infrastructure']['idGenerator']
): IdGenerator => {
  switch (config.type) {
    case 'uuid':
      return createUuidGenerator();
    case 'sequential':
      return createFakeIdGenerator();
  }
};

const createPasswordHasher = (
  config: AppConfig['infrastructure']['passwordHasher']
): PasswordHasher => {
  switch (config.type) {
    case 'bcrypt':
      return createBcryptPasswordHasher();
    case 'fake':
      return createFakePasswordHasher();
  }
};

export const createInfrastructure = (config: AppConfig): Infrastructure => {
  const database = createDatabase(config.database);

  const clock = createClock(config.infrastructure.clock);
  const idGenerator = createIdGenerator(config.infrastructure.idGenerator);
  const passwordHasher = createPasswordHasher(
    config.infrastructure.passwordHasher
  );

  return {
    database,
    clock,
    idGenerator,
    passwordHasher,
  };
};

export type CreateAppOptions = {
  config: AppConfig;
  infrastructure?: Infrastructure;
  silent?: boolean;
};

export const createAppFromConfig = async (options: CreateAppOptions) => {
  const { config, infrastructure, silent } = options;
  const { database, clock, idGenerator, passwordHasher } =
    infrastructure ?? createInfrastructure(config);
  const { db } = database;

  // Create auth stores
  const organizationStore = createSqliteOrganizationStore(db);
  const userStore = createSqliteUserStore(db);
  const tokenStore = createSqliteTokenStore(db);

  // Seed auth data if configured
  await seedAuthData({
    seedToken: config.seedToken,
    organizationStore,
    userStore,
    tokenStore,
    passwordHasher,
    idGenerator,
    clock,
    silent,
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
  const captureStore = createSqliteCaptureStore(db);
  const captureService = createCaptureService({
    store: captureStore,
    clock,
    idGenerator,
  });

  // Create admin services if admin config is provided
  let admin: AdminConfig | undefined;
  if (config.admin) {
    const adminSessionService = createAdminSessionService({
      adminPassword: config.admin.password,
      sessionSecret: config.admin.sessionSecret,
      clock,
    });

    const adminService = createAdminService({
      organizationStore,
      userStore,
      tokenStore,
      clock,
      idGenerator,
      passwordHasher,
    });

    admin = { adminService, adminSessionService };
  }

  return createApp({ captureService, authMiddleware, healthChecker, admin });
};
