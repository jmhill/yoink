import type { FastifyInstance } from 'fastify';
import { okAsync, ResultAsync } from 'neverthrow';
import type { Policy, UnitOfWork } from './kernel/unit-of-work.js';
import type { Task } from '@yoink/api-contracts';
import type { Database } from './platform/database/types.js';
import { createApp, createFastifyInstance, type AdminConfig, type SignupConfig } from './app.js';
import type { AppConfig } from './platform/config/schema.js';
import { openDatabase } from './platform/database/database.js';
import { createInMemoryUnitOfWork } from './platform/unit-of-work/in-memory-unit-of-work.js';
import {
  createSqliteUnitOfWork,
  type UnitOfWorkLogger,
  type WriteClient,
} from './platform/unit-of-work/sqlite-unit-of-work.js';
import { createHistoryEventSink } from './modules/history/application/prepare-event-sink.js';
import { CAPTURE_TIMELINE_BUILDERS } from './modules/history/domain/capture-timeline.js';
import { TASK_TIMELINE_BUILDERS } from './modules/history/domain/task-timeline.js';
import { createFakeHistoryParticipant } from './modules/history/infrastructure/fake-event-sink.js';
import { historySqlParticipant } from './modules/history/infrastructure/sqlite-event-sink.js';
import { createAccess } from './access/index.js';
import { createAdminSessionParticipant } from './access/infrastructure/admin-session-participant.js';
import { createNodeAdminSessionCrypto } from './access/infrastructure/node-admin-session-crypto.js';
import { createSimpleWebAuthnVerifier } from './access/infrastructure/simplewebauthn-verifier.js';
import { accessSqlParticipant } from './access/infrastructure/persistence/access-sql-participant.js';
import { createFakeSignupParticipant } from './access/infrastructure/fakes/fake-signup-participant.js';
import { createSqliteOrganizationTimeZone } from './access/infrastructure/sqlite-organization-time-zone.js';
import { createCaptures } from './modules/captures/index.js';
import { createFakeCaptureParticipant } from './modules/captures/infrastructure/fakes/fake-capture-participant.js';
import { createFakeCaptureStore } from './modules/captures/infrastructure/fakes/fake-capture-store.js';
import { capturesSqlParticipant } from './modules/captures/infrastructure/persistence/capture-sql-participant.js';
import {
  countTrashedCaptures,
  createSqliteCaptureStore,
} from './modules/captures/infrastructure/persistence/sqlite-capture-store.js';
import {
  createTaskManagement,
  createTaskService,
  storageError,
} from './modules/task-management/index.js';
import { createFakeTaskManagementParticipant } from './modules/task-management/infrastructure/fakes/fake-task-management-participant.js';
import { taskManagementSqlParticipant } from './modules/task-management/infrastructure/persistence/task-management-sql-participant.js';
import { createSqliteListStore } from './modules/task-management/infrastructure/persistence/sqlite-list-store.js';
import { createNoteHandlers } from './notes/application/create-note-handlers.js';
import { createSqliteNotesBackend } from './notes/infrastructure/sqlite-notes-backend.js';
import { loadOrgPersonFromSqlite } from './notes/infrastructure/load-org-person.js';
import {
  designateNotesMirrorBotFromSqlite,
  loadNotesMirrorBotFromSqlite,
} from './notes/infrastructure/load-notes-mirror-bot.js';
import { storageError as noteStorageError } from './notes/domain/note-errors.js';
import { createSqliteProjectStore } from './modules/task-management/infrastructure/persistence/sqlite-project-store.js';
import { createSqliteImportStore } from './modules/task-management/infrastructure/persistence/sqlite-import-store.js';
import { createSqliteTaskStore } from './modules/task-management/infrastructure/persistence/sqlite-task-store.js';
import { createPinoCommandLogger, createPinoHistoryReadLogger } from './platform/logging/index.js';
import { createHistoryHandlers } from './modules/history/index.js';
import { createSqliteChangeLogStore } from './modules/history/infrastructure/sqlite-change-log-store.js';
import { createSqliteTimelineLookups } from './modules/history/infrastructure/sqlite-history-lookups.js';
import { createSqliteWorkStore } from './modules/task-management/infrastructure/persistence/sqlite-work-store.js';
import { createReviewHandlers } from './review/application/create-review-handlers.js';
import { createSqliteReviewStore } from './review/infrastructure/sqlite-review-store.js';
import {
  createProcessingHandlers,
  deleteSourceCapturePolicy,
} from './workflows/processing/index.js';
import { createSqliteHealthChecker } from './platform/health/sqlite-health-checker.js';
import { createAuthMiddleware, type AuthMiddleware } from './edges/_shared/auth/auth-middleware.js';
import { createCombinedAuthMiddleware } from './edges/_shared/auth/combined-auth-middleware.js';
import { decideViaFly } from './edges/_shared/rate-limit-policy.js';
import { createTokenHandlers } from './access/application/create-token-handlers.js';
import {
  createStoreBackedTokenCreated,
  createStoreBackedTokenRevoked,
  createStoreBackedTokenReissue,
} from './access/infrastructure/store-backed-token-persist.js';
import { handleReissueAgentToken } from './access/application/handle-reissue-agent-token.js';
import { handleTransferOwnership } from './access/application/handle-transfer-ownership.js';
import { handleCreateWorkspace } from './access/application/handle-create-workspace.js';
import { handleIssueOwnerInvitation } from './access/application/handle-issue-owner-invitation.js';
import { handleGetOwnerInvitation } from './access/application/handle-get-owner-invitation.js';
import { handleListWorkspaces } from './access/application/handle-list-workspaces.js';
import { handleAcceptInvitation } from './access/application/handle-accept-invitation.js';
import { handleValidateInvitation } from './access/application/handle-validate-invitation.js';
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
  createSqliteWorkspaceStore,
  seedAuthData,
} from './access/infrastructure/index.js';
import { createChallengeManager } from './access/domain/challenge.js';
import {
  createTokenService,
  type TokenService,
  createPasskeyService,
  createSessionService,
  createSignupService,
  createInvitationService,
  createOrganizationService,
  createUserService,
  createMembershipService,
  type MembershipService,
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
  /** Same libsql client as `database`. The unit of work starts transactions on it. */
  writeClient: WriteClient;
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
  const { database, writeClient } = openDatabase(config.database);

  const clock = createClock(config.infrastructure.clock);
  const idGenerator = createIdGenerator(config.infrastructure.idGenerator);
  const passwordHasher = createPasswordHasher(
    config.infrastructure.passwordHasher
  );

  return {
    database,
    writeClient,
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
  /** Test seam: count or wrap validateToken without a second production lookup. */
  wrapTokenService?: (tokenService: TokenService) => TokenService;
  /** Test seam: supply the Fastify instance, including its logger. */
  app?: FastifyInstance;
};

export type BootstrappedApp = Awaited<ReturnType<typeof createApp>> & {
  readonly unitOfWork: UnitOfWork;
  readonly inMemoryUnitOfWork: UnitOfWork;
};

export const bootstrapApp = async (options: BootstrapOptions): Promise<BootstrappedApp> => {
  const { config, infrastructure, silent } = options;
  const viaFly =
    options.viaFly ??
    decideViaFly({
      flyAllocId: process.env.FLY_ALLOC_ID,
      flyAppName: process.env.FLY_APP_NAME,
    }).viaFly;
  const { database, writeClient, clock, idGenerator, passwordHasher } =
    infrastructure ?? createInfrastructure(config);

  // Create auth stores (async initialization for schema validation)
  const organizationStore = await createSqliteOrganizationStore(database);
  const userStore = await createSqliteUserStore(database);
  const tokenStore = await createSqliteTokenStore(database);
  const membershipStore = await createSqliteOrganizationMembershipStore(database);
  const invitationStore = await createSqliteInvitationStore(database);
  const workspaceStore = createSqliteWorkspaceStore(database);
  const codeGenerator = createCodeGenerator();

  const createWorkspace = (command: Parameters<typeof handleCreateWorkspace>[0]) =>
    handleCreateWorkspace(command, {
      userStore,
      workspaceStore,
      nextId: () => idGenerator.generate(),
      nextCode: () => codeGenerator.generate(),
      now: () => clock.now().toISOString(),
    });

  const issueOwnerInvitation = (
    command: Parameters<typeof handleIssueOwnerInvitation>[0]
  ) =>
    handleIssueOwnerInvitation(command, {
      organizationStore,
      membershipStore,
      invitationStore,
      userStore,
      nextId: () => idGenerator.generate(),
      nextCode: () => codeGenerator.generate(),
      now: () => clock.now().toISOString(),
    });

  const getOwnerInvitation = (organizationId: string) =>
    handleGetOwnerInvitation(organizationId, {
      organizationStore,
      membershipStore,
      invitationStore,
      now: () => clock.now().toISOString(),
    });

  const listWorkspaces = (query: Parameters<typeof handleListWorkspaces>[0]) =>
    handleListWorkspaces(query, {
      workspaceStore,
      now: () => clock.now().toISOString(),
    });

  const validateInvitation = (query: Parameters<typeof handleValidateInvitation>[0]) =>
    handleValidateInvitation(query, {
      invitationStore,
      now: () => clock.now().toISOString(),
    });

  const acceptInvitation = (command: Parameters<typeof handleAcceptInvitation>[0]) =>
    handleAcceptInvitation(command, {
      invitationStore,
      membershipStore,
      nextId: () => idGenerator.generate(),
      now: () => clock.now().toISOString(),
    });

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
  const createdTokenService = createTokenService({
    organizationStore,
    userStore,
    tokenStore,
    passwordHasher,
    clock,
  });
  const tokenService =
    options.wrapTokenService === undefined
      ? createdTokenService
      : options.wrapTokenService(createdTokenService);

  // Create UserService to be used by other services
  const userService = createUserService({ userStore });

  const historySink = createHistoryEventSink({
    ids: idGenerator,
    builders: { ...CAPTURE_TIMELINE_BUILDERS, ...TASK_TIMELINE_BUILDERS },
  });
  const batchLog: { error?: UnitOfWorkLogger['error'] } = {};
  // Filled after captures exists. Both factories keep this array, and commit
  // reads it then. The policy needs captures; captures needs the unit of work.
  const processingPolicies: Policy[] = [];
  const unitOfWork = createSqliteUnitOfWork({
    client: writeClient,
    participants: [
      accessSqlParticipant,
      historySqlParticipant,
      capturesSqlParticipant,
      taskManagementSqlParticipant,
    ],
    policies: processingPolicies,
    sink: historySink,
    logger: {
      error: (fields) => {
        batchLog.error?.(fields);
      },
    },
  });
  const inMemoryUnitOfWork = createInMemoryUnitOfWork({
    participants: [
      createFakeSignupParticipant(),
      createFakeHistoryParticipant(),
      createFakeCaptureParticipant(createFakeCaptureStore()),
      createFakeTaskManagementParticipant(),
    ],
    policies: processingPolicies,
    sink: historySink,
  });

  // Add, leave, remove, and role change commit one access plan.
  // Ownership transfer stays on handleTransferOwnership.
  const membershipService = createMembershipService({
    membershipStore,
    userService,
    organizationStore,
    clock,
    idGenerator,
    unitOfWork,
  });

  // Create takes the command, decides, and commits one access plan.
  // Get and list stay reads. notes_mirror_bot_user_id is not written here.
  const organizationService = createOrganizationService({
    organizationStore,
    clock,
    idGenerator,
    unitOfWork,
  });

  // Registration verify, authentication verify, and delete decide, then
  // commit one access plan. Option generation and list stay reads.
  // planRegistrationCredential still does not write. Signup's batch is unchanged.
  // Only created if webauthn config is provided
  let signupDraft:
    | Omit<SignupConfig, 'authenticateToken' | 'completeSignup' | 'agentService'>
    | undefined;
  if (config.webauthn) {
    const passkeyCredentialStore = await createSqlitePasskeyCredentialStore(database);
    const userSessionStore = await createSqliteUserSessionStore(database);

    const passkeyService = createPasskeyService({
      credentialStore: passkeyCredentialStore,
      userService,
      clock,
      verifier: createSimpleWebAuthnVerifier(config.webauthn),
      challenges: createChallengeManager({
        secret: config.webauthn.challengeSecret,
        clock,
      }),
      unitOfWork,
    });

    // Create, refresh, revoke, switch, and cleanup decide, then commit one
    // access plan. Validate stays a read. The edge still sets the cookie.
    const sessionService = createSessionService({
      sessionStore: userSessionStore,
      userService,
      membershipService,
      clock,
      idGenerator,
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      refreshThresholdMs: 24 * 60 * 60 * 1000, // 1 day
      unitOfWork,
    });

    // Validate decides and does not write. Complete decides from the same
    // queries, planRegistrationCredential verifies and does not write, then
    // commits the existing signup plan. The user insert stays the only guard.
    const signupService = createSignupService({
      invitationStore,
      userStore,
      organizationStore,
      membershipStore,
      clock,
      idGenerator,
      unitOfWork,
      verifySignupCredential: (input) =>
        passkeyService.planRegistrationCredential({
          userId: input.userId,
          challenge: input.challenge,
          response: input.response,
          ...(input.credentialName === undefined
            ? {}
            : { credentialName: input.credentialName }),
          skipUserIdCheck: true,
        }),
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
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

    const transferOwnership = (request: Parameters<typeof handleTransferOwnership>[0]) =>
      handleTransferOwnership(request, {
        loadMembers: (organizationId) => membershipStore.findByOrganizationId(organizationId),
        loadUser: (userId) => userService.getUser(userId),
        persistTransfer: ({ plan, event }) => membershipStore.transferOwnership(plan, event),
        nextId: () => idGenerator.generate(),
        now: () => clock.now().toISOString(),
      });

    const changeMemberRole = (request: Parameters<MembershipService['changeMemberRole']>[0]) =>
      membershipService.changeMemberRole(request);

    const removeMember = (request: Parameters<MembershipService['removeMember']>[0]) =>
      membershipService.removeMember(request);

    const reissueAgentToken = (command: Parameters<typeof handleReissueAgentToken>[0]) =>
      handleReissueAgentToken(command, {
        loadMembership: (userId, organizationId) =>
          membershipStore.findByUserAndOrg(userId, organizationId),
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

    signupDraft = {
      signupService,
      passkeyService,
      sessionService,
      tokenService,
      userService,
      tokenHandlers,
      reissueAgentToken,
      transferOwnership,
      changeMemberRole,
      removeMember,
    };
  }

  let authMiddleware: AuthMiddleware;

  // Create health checker
  const healthChecker = createSqliteHealthChecker(database);

  // Create capture store and service (async initialization)
  const captureStore = await createSqliteCaptureStore(database, clock);
  const invitationService = createInvitationService({
    invitationStore,
    organizationStore,
    membershipStore,
    clock,
    idGenerator,
    codeGenerator,
    unitOfWork,
  });
  const captures = createCaptures({
    load: (id) => captureStore.findById(id),
    list: (options) => captureStore.findByOrganization(options),
    countTrashed: (organizationId) => countTrashedCaptures(database, organizationId),
    uow: unitOfWork,
    ids: idGenerator,
    now: () => clock.now().toISOString(),
  });
  processingPolicies.push(deleteSourceCapturePolicy(captures));

  const app = createFastifyInstance(config.log);
  const commandLogger = createPinoCommandLogger(app.log);
  const historyReadLogger = createPinoHistoryReadLogger(app.log);

  const listStore = await createSqliteListStore(database);
  const taskStore = await createSqliteTaskStore(database);
  const projectStore = await createSqliteProjectStore(database);
  const principalLookup = {
    existsInOrganization: (principalId: string, organizationId: string) =>
      membershipService
        .getMembership({ userId: principalId, organizationId })
        .map((membership) => membership !== null)
        .orElse(() => okAsync(false)),
  };
  const importStore = createSqliteImportStore(database);
  const workStore = createSqliteWorkStore(database);
  const taskManagement = createTaskManagement({
    uow: unitOfWork,
    logger: commandLogger,
    nextId: () => idGenerator.generate(),
    now: () => clock.now().toISOString(),
    viewerNow: () => clock.now(),
    principalLookup,
    listNamedLists: (organizationId) => listStore.findByOrganization(organizationId),
    pageNamedLists: (options) => listStore.pageByOrganization(options),
    loadNamedList: (id) => listStore.findById(id),
    countOpenOnList: (listId) => taskStore.countOpenOnList(listId),
    loadOpenTasksOnList: (organizationId, listId) =>
      taskStore.findOpenInPile({ organizationId, listId }),
    pageOpenTasksOnList: (options) => taskStore.pageOpenInPile(options),
    loadListTasksByIds: (ids) =>
      ResultAsync.combine(ids.map((id) => taskStore.findById(id))).map((tasks) =>
        tasks.filter((task): task is Task => task !== null)
      ),
    loadOpenInPile: (organizationId, listId) =>
      taskStore.findOpenInPile({ organizationId, listId }),
    list: (options) => taskStore.findByOrganization(options),
    persistStage: (record) => importStore.insert(record),
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
    listProjects: (organizationId) => projectStore.findByOrganization(organizationId),
    pageProjects: (options) => projectStore.pageByOrganization(options),
    loadProject: (id) => projectStore.findById(id),
    loadTask: (id) => taskStore.findById(id),
    loadNextOpenOrder: (organizationId, listId) =>
      taskStore.nextOpenOrderInPile({ organizationId, listId }),
    pageOpenTasksOnProject: (options) => taskStore.pageOpenInProject(options),
    pageNextActions: (options) => workStore.pageNextActions(options),
    pageDue: (options) => workStore.pageDue(options),
    pageLists: (options) => workStore.pageLists(options),
    countUnlistedOpen: (organizationId) => workStore.countUnlistedOpen(organizationId),
  });
  const listHandlers = taskManagement.listHandlers;
  const projectHandlers = taskManagement.projectHandlers;

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
  const taskHandlers = taskManagement.taskHandlers;
  const workHandlers = taskManagement.workHandlers;

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

  const captureProcessingService = createProcessingHandlers({
    captures,
    taskManagement,
    uow: unitOfWork,
    logger: commandLogger,
  });

  // Create admin services if admin config is provided
  let admin: AdminConfig | undefined;
  if (config.admin) {
    const adminSessionCrypto = createNodeAdminSessionCrypto(config.admin.sessionSecret);
    const adminSessionService = createAdminSessionService({
      adminPassword: config.admin.password,
      clock,
      idGenerator, // Adds sessionId to tokens for defense-in-depth
      crypto: adminSessionCrypto,
      participant: createAdminSessionParticipant(adminSessionCrypto),
    });

    const adminService = createAdminService({
      organizationStore,
      organizationMembershipStore: membershipStore,
      userStore,
      invitationStore,
      tokenStore,
      projectStore,
      clock,
      idGenerator,
      passwordHasher,
      unitOfWork,
    });

    admin = {
      adminService,
      adminSessionService,
      invitationService,
      createWorkspace,
      issueOwnerInvitation,
      getOwnerInvitation,
      listWorkspaces,
    };
  }

  let agentService: SignupConfig['agentService'] | undefined;
  if (signupDraft) {
    const mintedAgentService = createAgentService({
      userStore,
      membershipStore,
      organizationStore,
      tokenStore,
      clock,
      idGenerator,
      passwordHasher,
      unitOfWork,
    });
    const designateNotesMirrorBot = designateNotesMirrorBotFromSqlite(database);
    agentService = {
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
  }

  const signupService =
    signupDraft?.signupService ??
    createSignupService({
      invitationStore,
      userStore,
      organizationStore,
      membershipStore,
      clock,
      idGenerator,
      unitOfWork,
      verifySignupCredential: null,
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
    });
  const access = createAccess({
    tokenService,
    sessionService: signupDraft?.sessionService ?? null,
    userStore,
    membershipStore,
    invitationStore,
    organizationStore,
    loadOrganizationTimeZone: createSqliteOrganizationTimeZone(database),
    clock,
    idGenerator,
    unitOfWork,
    signupService,
  });
  const signupConfig: SignupConfig | undefined =
    signupDraft && agentService
      ? {
          ...signupDraft,
          agentService,
          authenticateToken: access.queries.authenticateToken,
          completeSignup: access.commands.completeSignup,
        }
      : undefined;
  authMiddleware = signupConfig
    ? createCombinedAuthMiddleware({
        authenticateToken: access.queries.authenticateToken,
        authenticateSession: access.queries.authenticateSession,
        recordSessionActivity: access.commands.recordSessionActivity,
        sessionCookieName: config.cookie.sessionName,
      })
    : createAuthMiddleware({
        authenticateToken: access.queries.authenticateToken,
      });

  const server = await createApp({
    app: options.app ?? app,
    captures,
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
    invitationStore,
    membershipStore,
    userService,
    validateInvitation,
    acceptInvitation,
    signup: signupConfig,
    admin,
    rateLimit: config.rateLimit,
    log: config.log,
    cookie: config.cookie,
    viaFly,
  });
  batchLog.error = (fields) => {
    server.log.error(fields);
  };
  return Object.assign(server, { unitOfWork, inMemoryUnitOfWork });
};
