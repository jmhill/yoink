import { okAsync } from 'neverthrow';
import type { Database } from './database/types.js';
import { createApp, type AdminConfig, type SignupConfig } from './app.js';
import type { AppConfig } from './config/schema.js';
import { createDatabase } from './database/database.js';
import { createSqliteCaptureStore } from './captures/infrastructure/sqlite-capture-store.js';
import { createStoreBackedPersist } from './captures/infrastructure/store-backed-persist.js';
import { createCaptureHandlers } from './captures/application/create-capture-handlers.js';
import { createListHandlers } from './lists/application/create-list-handlers.js';
import { createSqliteListStore } from './lists/infrastructure/sqlite-list-store.js';
import { createStoreBackedPersist as createListStoreBackedPersist } from './lists/infrastructure/store-backed-persist.js';
import { createTaskService } from './tasks/domain/task-service.js';
import { createSqliteTaskStore } from './tasks/infrastructure/sqlite-task-store.js';
import { createStoreBackedPersist as createTaskStoreBackedPersist } from './tasks/infrastructure/store-backed-persist.js';
import { createTaskHandlers } from './tasks/application/create-task-handlers.js';
import { createCaptureProcessingService } from './processing/domain/processing-service.js';
import { createSqliteHealthChecker } from './health/infrastructure/sqlite-health-checker.js';
import {
  createAuthMiddleware,
  createCombinedAuthMiddleware,
} from './access/application/index.js';
import {
  createSqliteTokenStore,
  createSqlitePasskeyCredentialStore,
  createSqliteUserSessionStore,
  createSqliteOrganizationStore,
  createSqliteOrganizationMembershipStore,
  createSqliteInvitationStore,
  createSqliteUserStore,
  seedAuthData,
} from './access/infrastructure/index.js';
import {
  createTokenService,
  createPasskeyService,
  createSessionService,
  createSignupService,
  createUserTokenService,
  createInvitationService,
  createOrganizationService,
  createUserService,
  createMembershipService,
  createAgentService,
  createAdminSessionService,
  createAdminService,
} from './access/domain/index.js';
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

  // OrganizationService - manages organization CRUD
  const organizationService = createOrganizationService({
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

    const agentService = createAgentService({
      userService,
      membershipService,
      userTokenService,
      clock,
      idGenerator,
    });

    signupConfig = {
      signupService,
      passkeyService,
      sessionService,
      tokenService,
      userService,
      userTokenService,
      agentService,
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
  const captureHandlers = createCaptureHandlers({
    persist: createStoreBackedPersist(captureStore),
    load: (id) => captureStore.findById(id),
    list: (options) => captureStore.findByOrganization(options),
    nextId: () => idGenerator.generate(),
    now: () => clock.now().toISOString(),
  });

  const listStore = await createSqliteListStore(database);
  const taskStore = await createSqliteTaskStore(database, clock);
  const listHandlers = createListHandlers({
    persist: createListStoreBackedPersist({
      store: listStore,
      clearCompletedListIds: (listId) => taskStore.clearListIdOnCompleted(listId),
    }),
    list: (organizationId) => listStore.findByOrganization(organizationId),
    load: (id) => listStore.findById(id),
    countOpenOnList: (listId) => taskStore.countOpenOnList(listId),
    nextId: () => idGenerator.generate(),
    now: () => clock.now().toISOString(),
  });

  // Create task store and service (async initialization)
  const principalLookup = {
    existsInOrganization: (principalId: string, organizationId: string) =>
      membershipService
        .getMembership({ userId: principalId, organizationId })
        .map((membership) => membership !== null)
        .orElse(() => okAsync(false)),
  };
  const taskService = createTaskService({
    store: taskStore,
    clock,
    idGenerator,
    principalLookup,
  });
  const taskHandlers = createTaskHandlers({
    persist: createTaskStoreBackedPersist(taskStore),
    load: (id) => taskStore.findById(id),
    loadList: (id) => listStore.findById(id),
    principalLookup,
    nextId: () => idGenerator.generate(),
    now: () => clock.now().toISOString(),
  });

  // Create capture processing service (cross-entity operations)
  const captureProcessingService = createCaptureProcessingService({
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
    captureHandlers,
    listHandlers,
    taskService,
    taskHandlers,
    captureProcessingService,
    authMiddleware,
    healthChecker,
    invitationService,
    membershipService,
    organizationService,
    organizationStore,
    signup: signupConfig,
    admin,
    rateLimit: config.rateLimit,
    log: config.log,
    cookie: config.cookie,
  });
};
