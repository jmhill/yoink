import { okAsync, ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { Database } from './database/types.js';
import { createApp, createFastifyInstance, type AdminConfig, type SignupConfig } from './app.js';
import type { AppConfig } from './config/schema.js';
import { createDatabase } from './database/database.js';
import { createSqliteCaptureStore } from './captures/infrastructure/sqlite-capture-store.js';
import { createStoreBackedPersist } from './captures/infrastructure/store-backed-persist.js';
import { createCaptureHandlers } from './captures/application/create-capture-handlers.js';
import { createListHandlers } from './lists/application/create-list-handlers.js';
import { createSqliteListStore } from './lists/infrastructure/sqlite-list-store.js';
import { createSqliteListPersist } from './lists/infrastructure/store-backed-persist.js';
import { createProjectHandlers } from './projects/application/create-project-handlers.js';
import { createNoteHandlers } from './notes/application/create-note-handlers.js';
import { createSqliteNotesBackend } from './notes/infrastructure/sqlite-notes-backend.js';
import { loadOrgPersonFromSqlite } from './notes/infrastructure/load-org-person.js';
import {
  designateNotesMirrorBotFromSqlite,
  loadNotesMirrorBotFromSqlite,
} from './notes/infrastructure/load-notes-mirror-bot.js';
import { storageError as noteStorageError } from './notes/domain/note-errors.js';
import { createSqliteProjectStore } from './projects/infrastructure/sqlite-project-store.js';
import {
  createSqliteImportDiscard,
  createSqliteImportPersist,
  createSqliteProjectPersist,
  createSqliteProjectStatusPersist,
} from './projects/infrastructure/store-backed-persist.js';
import { createSqliteImportStore } from './projects/infrastructure/sqlite-import-store.js';
import { storageError } from './projects/domain/project-errors.js';
import { createTaskService } from './tasks/domain/task-service.js';
import { createSqliteTaskStore } from './tasks/infrastructure/sqlite-task-store.js';
import { createSqliteTaskPersist } from './tasks/infrastructure/store-backed-persist.js';
import {
  clearCompletedListIdQuery,
  setOpenOrderQueries,
} from './tasks/infrastructure/task-row-statements.js';
import { createPinoCommandLogger, createPinoHistoryReadLogger } from './logging/index.js';
import { createHistoryHandlers } from './history/application/create-history-handlers.js';
import { createSqliteChangeLogStore } from './shared/change-log/infrastructure/sqlite-change-log-store.js';
import { createSqliteTimelineLookups } from './history/infrastructure/sqlite-history-lookups.js';
import { createTaskHandlers } from './tasks/application/create-task-handlers.js';
import { createWorkHandlers } from './work/application/create-work-handlers.js';
import { createSqliteWorkStore } from './work/infrastructure/sqlite-work-store.js';
import { createReviewHandlers } from './review/application/create-review-handlers.js';
import { createSqliteReviewStore } from './review/infrastructure/sqlite-review-store.js';
import { createProcessingHandlers } from './processing/application/create-processing-handlers.js';
import {
  createSqliteProcessToProjectPersist,
  createSqliteProcessToTaskPersist,
} from './processing/infrastructure/persist-process.js';
import { createSqliteHealthChecker } from './health/infrastructure/sqlite-health-checker.js';
import {
  createAuthMiddleware,
  createCombinedAuthMiddleware,
  createRateLimitPrincipalResolver,
} from './access/application/index.js';
import { decideViaFly } from './shared/rate-limit-policy.js';
import { createTokenHandlers } from './access/application/create-token-handlers.js';
import {
  createStoreBackedTokenCreated,
  createStoreBackedTokenRevoked,
  createStoreBackedTokenReissue,
} from './access/infrastructure/store-backed-token-persist.js';
import { handleReissueAgentToken } from './access/application/handle-reissue-agent-token.js';
import { tokenStorageError } from './access/domain/auth-errors.js';
import { MAX_TOKENS_PER_USER_PER_ORG } from './access/domain/token-limits.js';
import { principalKindOf } from './access/domain/user.js';
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
  /** Override Fly detection. Defaults to FLY_ALLOC_ID / FLY_APP_NAME. */
  viaFly?: boolean;
};

export const bootstrapApp = async (options: BootstrapOptions) => {
  const { config, infrastructure, silent } = options;
  const viaFly =
    options.viaFly ??
    decideViaFly({
      flyAllocId: process.env.FLY_ALLOC_ID,
      flyAppName: process.env.FLY_APP_NAME,
    }).viaFly;
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

    const tokenHandlers = createTokenHandlers({
      listUserOrgTokens: (userId, organizationId) =>
        tokenStore.findByUserAndOrganization(userId, organizationId),
      load: (id) => tokenStore.findById(id),
      loadMembership: (userId, organizationId) =>
        membershipStore
          .findByUserAndOrg(userId, organizationId)
          .mapErr((error) => tokenStorageError(error.message, error))
          .map((membership) => (membership ? { role: membership.role } : null)),
      loadOwner: (userId) =>
        userStore
          .findById(userId)
          .mapErr((error) => tokenStorageError(error.message, error))
          .map((user) =>
            user
              ? {
                  userId: user.id,
                  kind: principalKindOf(user),
                }
              : null
          ),
      persistCreate: createStoreBackedTokenCreated(tokenStore),
      persistRevoke: createStoreBackedTokenRevoked(tokenStore),
      hashSecret: (secret) =>
        ResultAsync.fromPromise(
          passwordHasher.hash(secret),
          (error) => tokenStorageError('Failed to hash token secret', error)
        ),
      nextId: () => idGenerator.generate(),
      nextSecret: () => idGenerator.generate(),
      now: () => clock.now().toISOString(),
      maxTokensPerUserPerOrg: MAX_TOKENS_PER_USER_PER_ORG,
    });

    const reissueAgentToken = (command: Parameters<typeof handleReissueAgentToken>[0]) =>
      handleReissueAgentToken(command, {
        loadMembership: (userId, organizationId) =>
          membershipService.getMembership({ userId, organizationId }),
        loadUser: (userId) => userService.getUser(userId),
        persistReissue: createStoreBackedTokenReissue(tokenStore),
        hashSecret: (secret) =>
          ResultAsync.fromPromise(
            passwordHasher.hash(secret),
            (error) => tokenStorageError('Failed to hash token secret', error)
          ),
        nextId: () => idGenerator.generate(),
        nextSecret: () => idGenerator.generate(),
        now: () => clock.now().toISOString(),
      });

    const mintedAgentService = createAgentService({
      userService,
      membershipService,
      createToken: (command) =>
        tokenHandlers.create(command).map(({ token, rawToken }) => ({ token, rawToken })),
      clock,
      idGenerator,
    });
    const designateNotesMirrorBot = designateNotesMirrorBotFromSqlite(database);
    const agentService: typeof mintedAgentService = {
      mintAgent: (command) =>
        mintedAgentService.mintAgent(command).andThen((minted) =>
          designateNotesMirrorBot({
            organizationId: command.organizationId,
            userId: minted.user.id,
            name: minted.user.name ?? command.name,
          })
            .mapErr((error) => tokenStorageError(error.message, error.cause))
            .map(() => minted)
        ),
    };

    signupConfig = {
      signupService,
      passkeyService,
      sessionService,
      tokenService,
      userService,
      tokenHandlers,
      agentService,
      reissueAgentToken,
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

  const resolveRateLimitPrincipal = createRateLimitPrincipalResolver({
    tokenService,
    sessionService: signupConfig?.sessionService,
  });

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

  const app = createFastifyInstance(config.log);
  const commandLogger = createPinoCommandLogger(app.log);
  const historyReadLogger = createPinoHistoryReadLogger(app.log);

  const listStore = await createSqliteListStore(database);
  const taskStore = await createSqliteTaskStore(database);
  const listHandlers = createListHandlers({
    persist: createSqliteListPersist({
      db: database,
      taskSql: {
        clearCompletedListId: clearCompletedListIdQuery,
        setOpenOrders: setOpenOrderQueries,
      },
    }),
    list: (organizationId) => listStore.findByOrganization(organizationId),
    pageNamedLists: (options) => listStore.pageByOrganization(options),
    load: (id) => listStore.findById(id),
    countOpenOnList: (listId) => taskStore.countOpenOnList(listId),
    loadOpenTasksOnList: (organizationId, listId) =>
      taskStore.findOpenInPile({ organizationId, listId }),
    pageOpenTasksOnList: (options) => taskStore.pageOpenInPile(options),
    loadTasksByIds: (ids) =>
      ResultAsync.combine(ids.map((id) => taskStore.findById(id))).map((tasks) =>
        tasks.filter((task): task is Task => task !== null)
      ),
    nextId: () => idGenerator.generate(),
    now: () => clock.now().toISOString(),
    logger: commandLogger,
  });

  const projectStore = await createSqliteProjectStore(database);
  const principalLookup = {
    existsInOrganization: (principalId: string, organizationId: string) =>
      membershipService
        .getMembership({ userId: principalId, organizationId })
        .map((membership) => membership !== null)
        .orElse(() => okAsync(false)),
  };
  const persistProjectBatch = createSqliteProjectStatusPersist({ db: database });
  const importStore = createSqliteImportStore(database);
  const projectHandlers = createProjectHandlers({
    persist: createSqliteProjectPersist({ db: database }),
    persistStatus: (input) =>
      persistProjectBatch(input).mapErr((error) =>
        error.type === 'PROJECT_DONE' ? storageError(error.message) : error
      ),
    persistSetNextAction: persistProjectBatch,
    persistStage: (record) => importStore.insert(record),
    persistApply: createSqliteImportPersist({ db: database }),
    persistDiscard: createSqliteImportDiscard({ db: database }),
    loadImport: (id) => importStore.findById(id),
    listPendingImports: (organizationId) => importStore.listPending(organizationId),
    loadTasksByIds: (ids) => taskStore.findByIds(ids),
    loadListsByIds: (ids) =>
      listStore
        .findByIds(ids)
        .map((lists) => lists.map((list) => ({ id: list.id, organizationId: list.organizationId }))),
    loadMemberIds: (organizationId) =>
      membershipService
        .listMemberships({ organizationId })
        .map((memberships) => new Set(memberships.map((membership) => membership.userId)))
        .mapErr((error) =>
          storageError(
            'message' in error && typeof error.message === 'string' ? error.message : error.type
          )
        ),
    loadUserName: (userId) =>
      userStore
        .findById(userId)
        .map((user) => user?.name ?? user?.email ?? 'Unknown')
        .mapErr((error) => storageError(error.message)),
    list: (organizationId) => projectStore.findByOrganization(organizationId),
    pageProjects: (options) => projectStore.pageByOrganization(options),
    load: (id) => projectStore.findById(id),
    loadTask: (id) => taskStore.findById(id),
    loadList: (id) => listStore.findById(id),
    loadNextOpenOrder: (organizationId, listId) =>
      taskStore.nextOpenOrderInPile({ organizationId, listId }),
    pageOpenTasksOnProject: (options) => taskStore.pageOpenInProject(options),
    principalLookup,
    nextId: () => idGenerator.generate(),
    now: () => clock.now().toISOString(),
    logger: commandLogger,
  });

  const noteHandlers = createNoteHandlers({
    backend: createSqliteNotesBackend(database),
    loadProject: (id) =>
      projectStore.findById(id).mapErr((error) => noteStorageError(error.message, error.cause)),
    loadActorName: (userId) =>
      userStore
        .findById(userId)
        .map((user) => user?.name ?? user?.email ?? 'Unknown')
        .mapErr((error) =>
          noteStorageError(
            'message' in error && typeof error.message === 'string' ? error.message : error.type
          )
        ),
    loadOrgPerson: loadOrgPersonFromSqlite(database),
    loadNotesMirrorBot: loadNotesMirrorBotFromSqlite(
      database,
      config.notesMirrorBotUserId ?? null
    ),
    nextId: () => idGenerator.generate(),
    now: () => clock.now().toISOString(),
    logger: commandLogger,
  });

  const changeLogStore = createSqliteChangeLogStore(database);
  const historyHandlers = createHistoryHandlers({
    loadProject: (id) => projectStore.findById(id),
    loadTaskIncludingDeleted: (id) => taskStore.findByIdIncludingDeleted(id),
    pageProjectHistory: (options) => changeLogStore.pageVisibleForProject(options),
    pageTaskHistory: (options) => changeLogStore.pageVisibleForTask(options),
    pageFinishedTasksInProject: (options) => taskStore.pageFinishedInProject(options),
    loadLookups: createSqliteTimelineLookups(database),
    logger: historyReadLogger,
  });
  const taskService = createTaskService({
    store: taskStore,
  });
  const taskHandlers = createTaskHandlers({
    persist: createSqliteTaskPersist({
      db: database,
    }),
    load: (id) => taskStore.findById(id),
    loadList: (id) => listStore.findById(id),
    loadProject: (id) => projectStore.findById(id),
    loadNextOpenOrder: (organizationId, listId) =>
      taskStore.nextOpenOrderInPile({ organizationId, listId }),
    loadOpenInPile: (organizationId, listId) =>
      taskStore.findOpenInPile({ organizationId, listId }),
    list: (options) => taskStore.findByOrganization(options),
    viewerNow: () => clock.now(),
    principalLookup,
    nextId: () => idGenerator.generate(),
    now: () => clock.now().toISOString(),
    logger: commandLogger,
  });

  const workStore = createSqliteWorkStore(database);
  const workHandlers = createWorkHandlers({
    pageNextActions: (options) => workStore.pageNextActions(options),
    pageDue: (options) => workStore.pageDue(options),
    pageLists: (options) => workStore.pageLists(options),
    countUnlistedOpen: (organizationId) => workStore.countUnlistedOpen(organizationId),
    now: () => clock.now(),
  });

  const reviewStore = createSqliteReviewStore(database);
  const reviewLookups = createSqliteTimelineLookups(database);
  const reviewHandlers = createReviewHandlers({
    pageReview: (options) => reviewStore.pageReview(options),
    loadTimeZone: (organizationId) => reviewStore.loadTimeZone(organizationId),
    pageDoneList: (options) => reviewStore.pageDoneList(options),
    loadCompletedByNames: (userIds) =>
      reviewLookups({ taskIds: [], userIds, projectIds: [], noteIds: [] }).map(
        (lookups) => (userId: string) => lookups.actorNameOf(userId)
      ),
    now: () => clock.now(),
  });

  const processToTaskPersist = createSqliteProcessToTaskPersist({ db: database });
  const processToProjectPersist = createSqliteProcessToProjectPersist({ db: database });
  const captureProcessingService = createProcessingHandlers({
    processToTask: {
      loadCapture: (id) => captureStore.findById(id),
      loadList: (id) => listStore.findById(id),
      loadProject: (id) => projectStore.findById(id),
      loadNextOpenOrder: (organizationId, listId) =>
        taskStore.nextOpenOrderInPile({ organizationId, listId }),
      persist: processToTaskPersist,
      nextId: () => idGenerator.generate(),
      now: () => clock.now().toISOString(),
    },
    processToProject: {
      loadCapture: (id) => captureStore.findById(id),
      listProjects: (organizationId) => projectStore.findByOrganization(organizationId),
      persist: processToProjectPersist,
      nextId: () => idGenerator.generate(),
      now: () => clock.now().toISOString(),
    },
    logger: commandLogger,
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
      projectStore,
      clock,
      idGenerator,
      passwordHasher,
    });

    admin = { adminService, adminSessionService, invitationService };
  }

  return createApp({
    app,
    captureHandlers,
    listHandlers,
    projectHandlers,
    noteHandlers,
    historyHandlers,
    taskService,
    taskHandlers,
    workHandlers,
    reviewHandlers,
    enableTestFixtures: process.env.YOINK_TEST_FIXTURES === 'true',
    database,
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
    viaFly,
    resolveRateLimitPrincipal,
  });
};
