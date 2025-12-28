import type { Database } from './database/types.js';
import { createApp, type AdminConfig } from './app.js';
import type { AppConfig } from './config/schema.js';
import { createDatabase } from './database/database.js';
import { createCaptureService } from './captures/domain/capture-service.js';
import { createSqliteCaptureStore } from './captures/infrastructure/sqlite-capture-store.js';
import { createTaskService } from './tasks/domain/task-service.js';
import { createSqliteTaskStore } from './tasks/infrastructure/sqlite-task-store.js';
import { createCaptureProcessingService } from './processing/domain/processing-service.js';
import { createTokenService } from './auth/domain/token-service.js';
import { createAuthMiddleware } from './auth/application/auth-middleware.js';
import { createSqliteHealthChecker } from './health/infrastructure/sqlite-health-checker.js';
import {
  createSqliteTokenStore,
  seedAuthData,
} from './auth/infrastructure/index.js';
import { createSqliteOrganizationStore } from './organizations/infrastructure/sqlite-organization-store.js';
import { createSqliteOrganizationMembershipStore } from './organizations/infrastructure/sqlite-organization-membership-store.js';
import { createSqliteInvitationStore } from './organizations/infrastructure/sqlite-invitation-store.js';
import { createInvitationService } from './organizations/domain/invitation-service.js';
import { createSqliteUserStore } from './users/infrastructure/sqlite-user-store.js';
import { createUserService } from './users/domain/user-service.js';
import { createMembershipService } from './organizations/domain/membership-service.js';
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
  createCodeGenerator,
  type Clock,
  type IdGenerator,
  type PasswordHasher,
} from '@yoink/infrastructure';

export type Infrastructure = {
  database: Database;
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

export type BootstrapOptions = {
  config: AppConfig;
  infrastructure?: Infrastructure;
  silent?: boolean;
};

export const bootstrapApp = async (options: BootstrapOptions) => {
  const { config, infrastructure, silent } = options;
  const { database, clock, idGenerator, passwordHasher } =
    infrastructure ?? createInfrastructure(config);

  // Create auth stores (async initialization for schema validation)
  const organizationStore = await createSqliteOrganizationStore(database);
  const userStore = await createSqliteUserStore(database);
  const tokenStore = await createSqliteTokenStore(database);
  const membershipStore = await createSqliteOrganizationMembershipStore(database);

  // Seed auth data if configured
  await seedAuthData({
    seedToken: config.seedToken,
    organizationStore,
    userStore,
    tokenStore,
    membershipStore,
    passwordHasher,
    idGenerator,
    clock,
    silent,
  });

  // Create auth services
  const tokenService = createTokenService({
    organizationStore,
    userStore,
    tokenStore,
    passwordHasher,
    clock,
  });

  // Create UserService to be used by other services
  const userService = createUserService({ userStore });

  // MembershipService - used by invitation routes for creating memberships
  const membershipService = createMembershipService({
    membershipStore,
    userService,
    organizationStore,
    clock,
    idGenerator,
  });

  // InvitationService - manages organization invitations
  const invitationStore = await createSqliteInvitationStore(database);
  const codeGenerator = createCodeGenerator();
  const invitationService = createInvitationService({
    invitationStore,
    organizationStore,
    membershipStore,
    clock,
    idGenerator,
    codeGenerator,
  });

  // Create auth middleware
  const authMiddleware = createAuthMiddleware({ tokenService });

  // Create health checker
  const healthChecker = createSqliteHealthChecker({ tokenStore });

  // Create capture store and service (async initialization)
  const captureStore = await createSqliteCaptureStore(database, clock);
  const captureService = createCaptureService({
    store: captureStore,
    clock,
    idGenerator,
  });

  // Create task store and service (async initialization)
  const taskStore = await createSqliteTaskStore(database, clock);
  const taskService = createTaskService({
    store: taskStore,
    clock,
    idGenerator,
  });

  // Create capture processing service (cross-entity operations)
  // Uses transactions for atomicity across stores
  const captureProcessingService = createCaptureProcessingService({
    database,
    captureStore,
    taskStore,
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
      idGenerator, // Adds sessionId to tokens for defense-in-depth
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

  return createApp({
    captureService,
    taskService,
    captureProcessingService,
    authMiddleware,
    healthChecker,
    invitationService,
    membershipService,
    admin,
    rateLimit: config.rateLimit,
    log: config.log,
  });
};
