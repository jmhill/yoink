import type { Database } from './database/types.js';
import { createApp, type AdminConfig, type SignupConfig } from './app.js';
import type { AppConfig } from './config/schema.js';
import { createDatabase } from './database/database.js';
import { createCaptureService } from './captures/domain/capture-service.js';
import { createSqliteCaptureStore } from './captures/infrastructure/sqlite-capture-store.js';
import { createTaskService } from './tasks/domain/task-service.js';
import { createSqliteTaskStore } from './tasks/infrastructure/sqlite-task-store.js';
import { createCaptureProcessingService } from './processing/domain/processing-service.js';
import { createTokenService } from './auth/domain/token-service.js';
import { createAuthMiddleware } from './auth/application/auth-middleware.js';
import { createCombinedAuthMiddleware } from './auth/application/combined-auth-middleware.js';
import { createSqliteHealthChecker } from './health/infrastructure/sqlite-health-checker.js';
import {
  createSqliteTokenStore,
  createSqlitePasskeyCredentialStore,
  createSqliteUserSessionStore,
  seedAuthData,
} from './auth/infrastructure/index.js';
import { createPasskeyService } from './auth/domain/passkey-service.js';
import { createSessionService } from './auth/domain/session-service.js';
import { createSignupService } from './auth/domain/signup-service.js';
import { createUserTokenService } from './auth/domain/user-token-service.js';
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
  const invitationStore = await createSqliteInvitationStore(database);
  const codeGenerator = createCodeGenerator();

  // Seed auth data if configured
  await seedAuthData({
    seedToken: config.seedToken,
    seedInvitationEmail: config.seedInvitationEmail,
    organizationStore,
    userStore,
    tokenStore,
    membershipStore,
    invitationStore,
    passwordHasher,
    idGenerator,
    codeGenerator,
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
  const invitationService = createInvitationService({
    invitationStore,
    organizationStore,
    membershipStore,
    clock,
    idGenerator,
    codeGenerator,
  });

  // Passkey and session services (for signup flow)
  // Only created if webauthn config is provided
  let signupConfig: SignupConfig | undefined;
  if (config.webauthn) {
    const passkeyCredentialStore = await createSqlitePasskeyCredentialStore(database);
    const userSessionStore = await createSqliteUserSessionStore(database);

    const passkeyService = createPasskeyService({
      credentialStore: passkeyCredentialStore,
      userService,
      config: config.webauthn,
      clock,
    });

    const sessionService = createSessionService({
      sessionStore: userSessionStore,
      userService,
      membershipService,
      clock,
      idGenerator,
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      refreshThresholdMs: 24 * 60 * 60 * 1000, // 1 day
    });

    const signupService = createSignupService({
      invitationStore,
      userStore,
      organizationStore,
      membershipStore,
      clock,
      idGenerator,
    });

    const userTokenService = createUserTokenService({
      tokenStore,
      clock,
      idGenerator,
      passwordHasher,
      maxTokensPerUserPerOrg: 2,
    });

    signupConfig = {
      signupService,
      passkeyService,
      sessionService,
      tokenService,
      userService,
      userTokenService,
    };
  }

  // Create auth middleware - uses combined auth if WebAuthn is enabled
  // Combined auth supports both session cookies (for passkey users) and Bearer tokens
  const authMiddleware = signupConfig
    ? createCombinedAuthMiddleware({
        tokenService,
        sessionService: signupConfig.sessionService,
        sessionCookieName: config.cookie.sessionName,
      })
    : createAuthMiddleware({ tokenService });

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
      organizationMembershipStore: membershipStore,
      userStore,
      tokenStore,
      clock,
      idGenerator,
      passwordHasher,
    });

    admin = { adminService, adminSessionService, invitationService };
  }

  return createApp({
    captureService,
    taskService,
    captureProcessingService,
    authMiddleware,
    healthChecker,
    invitationService,
    membershipService,
    organizationStore,
    signup: signupConfig,
    admin,
    rateLimit: config.rateLimit,
    log: config.log,
    cookie: config.cookie,
  });
};
