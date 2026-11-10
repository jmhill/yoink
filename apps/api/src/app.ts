import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { FastifyLoggerOptions, PinoLoggerOptions } from 'fastify/types/logger.js';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import * as Sentry from '@sentry/node';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerOrpcHealthRoutes } from './edges/ops/orpc-health-routes.js';
import { registerExtensionApiV1 } from './edges/extension/v1/index.js';
import { registerWebApi } from './edges/web/index.js';
import { registerPublicApiV1 } from './edges/public-api/v1/index.js';
import { registerAdminRoutes, type AdminRoutesDependencies } from './edges/admin/index.js';
import { registerAuthRoutes } from './edges/legacy/auth/auth-routes.js';
import { registerInvitationRoutes, type InvitationRoutesDependencies } from './edges/legacy/invitation/invitation-routes.js';
import { registerOrganizationRoutes } from './edges/legacy/organization/organization-routes.js';
import { registerPasskeyRoutes } from './edges/legacy/passkey/passkey-routes.js';
import { registerSignupRoutes } from './edges/legacy/signup/signup-routes.js';
import { registerTokenMutationRoutes } from './edges/legacy/tokens/token-routes.js';
import { registerReviewFixtureRoutes } from './edges/test-fixtures/http-review-fixture-routes.js';
import { registerOwnerlessWorkspaceFixtureRoutes } from './edges/test-fixtures/http-ownerless-workspace-fixture-routes.js';
import { createAuthMiddleware, type AuthMiddleware } from './edges/_shared/auth/auth-middleware.js';
import { withAuthenticatedRateLimit } from './edges/_shared/auth/with-authenticated-rate-limit.js';
import type {
  ChangeMemberRoleHandler,
  ReissueAgentToken,
  RemoveMemberHandler,
  TransferOwnershipHandler,
} from './access/application/index.js';
import type { TokenHandlers } from './access/application/create-token-handlers.js';
import type { Captures } from './modules/captures/index.js';
import type {
  ListHandlers,
  ProjectHandlers,
  TaskHandlers,
  TaskService,
  WorkHandlers,
} from './modules/task-management/index.js';
import type { NoteHandlers } from './notes/application/create-note-handlers.js';
import type { HistoryHandlers } from './modules/history/index.js';
import type { ReviewHandlers } from './review/application/create-review-handlers.js';
import type { CaptureProcessingService } from './processing/application/create-processing-handlers.js';
import type { HealthChecker } from './platform/health/health-checker.js';
import type { Access } from './access/index.js';
import type {
  AdminService,
  AdminSessionService,
  InvitationService,
  MembershipService,
  OrganizationService,
  SignupService,
  PasskeyService,
  SessionService,
  TokenService,
  UserService,
  AgentService,
} from './access/domain/index.js';
// TODO(8.5.4): store interfaces are not part of the access public API;
// auth-routes should stop needing an OrganizationStore dependency
import type { OrganizationStore } from './access/domain/organization-store.js';
import type { InvitationStore } from './access/domain/invitation-store.js';
import type { OrganizationMembershipStore } from './access/domain/organization-membership-store.js';
import {
  DEFAULT_GLOBAL_RATE_LIMIT_MAX,
  DEFAULT_IP_RATE_LIMIT_MAX,
  type RateLimitConfig,
  type LogConfig,
  type CookieConfig,
} from './platform/config/schema.js';
import type { Database } from './platform/database/types.js';
import { createLoggerOptions, registerRequestCompletedLog } from './platform/logging/index.js';
import { shouldHandleError } from './platform/logging/should-handle-error.js';
import { applyStaticCacheHeaders, NEVER_CACHE_CONTROL } from './edges/_shared/server/static-cache-control.js';
import { decideSpaFallback } from './edges/_shared/server/spa-fallback.js';
import {
  decideRateLimitExempt,
  decideRateLimitKey,
  decideTimeWindowMs,
} from './edges/_shared/rate-limit-policy.js';
import { createInMemoryRateLimitConsume } from './edges/_shared/in-memory-rate-limit-consume.js';
import { clientIpOfRequest, type ClientIpOf } from './edges/_shared/request-client-ip.js';
import { registerJsonBodyParser } from './edges/_shared/server/json-body.js';
import { trustImmediateProxy } from './edges/_shared/server/trust-proxy.js';
const __dirname = dirname(fileURLToPath(import.meta.url));

export type AdminConfig = {
  adminService: AdminService;
  adminSessionService: AdminSessionService;
  invitationService: InvitationService;
  createWorkspace: AdminRoutesDependencies['createWorkspace'];
  issueOwnerInvitation: AdminRoutesDependencies['issueOwnerInvitation'];
  getOwnerInvitation: AdminRoutesDependencies['getOwnerInvitation'];
  listWorkspaces: AdminRoutesDependencies['listWorkspaces'];
};

export type SignupConfig = {
  signupService: SignupService;
  passkeyService: PasskeyService;
  sessionService: SessionService;
  tokenService: TokenService;
  authenticateToken: Access['queries']['authenticateToken'];
  completeSignup: Access['commands']['completeSignup'];
  userService: UserService;
  tokenHandlers: TokenHandlers;
  agentService: AgentService;
  reissueAgentToken: ReissueAgentToken;
  transferOwnership: TransferOwnershipHandler;
  changeMemberRole: ChangeMemberRoleHandler;
  removeMember: RemoveMemberHandler;
};

export type AppDependencies = {
  captures: Captures;
  listHandlers: ListHandlers;
  projectHandlers: ProjectHandlers;
  noteHandlers: NoteHandlers;
  historyHandlers: HistoryHandlers;
  taskService: TaskService;
  taskHandlers: TaskHandlers;
  workHandlers: WorkHandlers;
  reviewHandlers: ReviewHandlers;
  enableTestFixtures?: boolean;
  database?: Database;
  captureProcessingService: CaptureProcessingService;
  authMiddleware: AuthMiddleware;
  healthChecker: HealthChecker;
  invitationService: InvitationService;
  membershipService: MembershipService;
  organizationService: OrganizationService;
  organizationStore: OrganizationStore;
  invitationStore?: InvitationStore;
  membershipStore?: OrganizationMembershipStore;
  userService: UserService;
  validateInvitation: InvitationRoutesDependencies['validateInvitation'];
  acceptInvitation: InvitationRoutesDependencies['acceptInvitation'];
  signup?: SignupConfig;
  admin?: AdminConfig;
  rateLimit?: RateLimitConfig;
  log: LogConfig;
  cookie: CookieConfig;
  app?: FastifyInstance;
  /** True only when the process is running behind Fly (FLY_ALLOC_ID / FLY_APP_NAME). */
  viaFly?: boolean;
};

export const createFastifyInstance = (
  log: LogConfig,
  logger: PinoLoggerOptions & FastifyLoggerOptions = {}
): FastifyInstance => {
  const app = Fastify({
    logger: { ...createLoggerOptions(log), ...logger },
    trustProxy: trustImmediateProxy,
    logController: new LogController({ disableRequestLogging: true }),
  });
  registerJsonBodyParser(app);
  registerRequestCompletedLog(app);
  return app;
};

// Default rate limit configuration
const defaultRateLimitConfig: RateLimitConfig = {
  enabled: true,
  globalMax: DEFAULT_GLOBAL_RATE_LIMIT_MAX,
  globalTimeWindow: '1 minute',
  ipMax: DEFAULT_IP_RATE_LIMIT_MAX,
  adminLoginMax: 5,
  adminLoginTimeWindow: '15 minutes',
  authLoginMax: 10,
  authLoginTimeWindow: '15 minutes',
  signupMax: 5,
  signupTimeWindow: '1 hour',
};

export const createApp = async (deps: AppDependencies) => {
  const app = deps.app ?? createFastifyInstance(deps.log);
  const rateLimitConfig = deps.rateLimit ?? defaultRateLimitConfig;
  const viaFly = deps.viaFly ?? false;
  const clientIpOf: ClientIpOf = (request) => clientIpOfRequest(request, viaFly);
  // Public API and the legacy web routes share this one authenticated bucket.
  // Admin login, auth login, and signup keep their own windows on those edges.
  // Splitting this bucket would raise the effective limit.
  const applyAuthenticatedRateLimit = rateLimitConfig.enabled
    ? createInMemoryRateLimitConsume({
        max: rateLimitConfig.globalMax,
        windowMs: decideTimeWindowMs({ timeWindow: rateLimitConfig.globalTimeWindow }).windowMs,
        now: () => Date.now(),
      })
    : undefined;
  const authMiddleware =
    applyAuthenticatedRateLimit === undefined
      ? deps.authMiddleware
      : withAuthenticatedRateLimit(deps.authMiddleware, applyAuthenticatedRateLimit);

  // Register security plugins
  await app.register(helmet, {
    // Configure Content Security Policy for SPA serving
    contentSecurityPolicy: false, // Disable CSP for now (SPA needs inline scripts from Vite)
  });

  await app.register(cookie);

  // Cheap IP bucket first: no session/token lookups. Forged credentials cannot
  // add hash work or mint a new bucket once this IP is over the limit.
  if (rateLimitConfig.enabled) {
    await app.register(rateLimit, {
      global: true,
      max: rateLimitConfig.ipMax,
      timeWindow: rateLimitConfig.globalTimeWindow,
      keyGenerator: (request) =>
        decideRateLimitKey({ clientIp: clientIpOf(request) }).key,
      allowList: (request) => decideRateLimitExempt({ url: request.url }).exempt,
    });
  }

  // oRPC OpenAPI serves the HTTP API. Fastify rejects a second registration
  // of the same method and path. Fixture routes stay raw Fastify.
  await registerOrpcHealthRoutes(app, { healthChecker: deps.healthChecker });
  const tokenOnly =
    deps.signup === undefined
      ? deps.authMiddleware
      : createAuthMiddleware({ authenticateToken: deps.signup.authenticateToken });
  const tokenAuth =
    deps.signup === undefined
      ? authMiddleware
      : applyAuthenticatedRateLimit === undefined
        ? tokenOnly
        : withAuthenticatedRateLimit(tokenOnly, applyAuthenticatedRateLimit);
  await registerPublicApiV1(app, {
    captures: deps.captures,
    captureProcessingService: deps.captureProcessingService,
    listHandlers: deps.listHandlers,
    projectHandlers: deps.projectHandlers,
    historyHandlers: deps.historyHandlers,
    noteHandlers: deps.noteHandlers,
    taskService: deps.taskService,
    taskHandlers: deps.taskHandlers,
    workHandlers: deps.workHandlers,
    reviewHandlers: deps.reviewHandlers,
    tokenHandlers: deps.signup?.tokenHandlers,
    tokenAuth,
    aliasAuth: authMiddleware,
  });
  // New extension builds. Older builds stay on the /api alias above.
  await registerExtensionApiV1(app, {
    captures: deps.captures,
    tokenAuth,
  });
  // Inbox, and settings when signup exists. Other screens stay on the /api alias.
  await registerWebApi(app, {
    captures: deps.captures,
    combinedAuth: authMiddleware,
    settings:
      deps.signup === undefined
        ? undefined
        : {
            sessionService: deps.signup.sessionService,
            membershipService: deps.membershipService,
            userService: deps.signup.userService,
            agentService: deps.signup.agentService,
            reissueAgentToken: deps.signup.reissueAgentToken,
            transferOwnership: deps.signup.transferOwnership,
            changeMemberRole: deps.signup.changeMemberRole,
            removeMember: deps.signup.removeMember,
            invitationService: deps.invitationService,
            tokenHandlers: deps.signup.tokenHandlers,
          },
  });
  if (deps.enableTestFixtures && deps.database) {
    await registerReviewFixtureRoutes(app, {
      authMiddleware,
      db: deps.database,
    });
  }
  if (
    deps.enableTestFixtures &&
    deps.admin &&
    deps.invitationStore &&
    deps.membershipStore
  ) {
    await registerOwnerlessWorkspaceFixtureRoutes(app, {
      adminSessionService: deps.admin.adminSessionService,
      organizationStore: deps.organizationStore,
      invitationStore: deps.invitationStore,
      membershipStore: deps.membershipStore,
    });
  }

  // Admin session auth. `/api/admin` stays until M6.5. The admin app uses `/admin-api`.
  if (deps.admin) {
    await registerAdminRoutes(
      app,
      { ...deps.admin, cookieConfig: deps.cookie, clientIpOf },
      rateLimitConfig
    );
  }

  // Invitation routes
  await registerInvitationRoutes(app, {
    invitationService: deps.invitationService,
    membershipService: deps.membershipService,
    organizationService: deps.organizationService,
    userService: deps.userService,
    validateInvitation: deps.validateInvitation,
    acceptInvitation: deps.acceptInvitation,
    authMiddleware,
  });

  // Session cookie configuration (shared between signup and passkey routes)
  const sessionCookieName = deps.cookie.sessionName;
  const cookieOptions = {
    httpOnly: true,
    secure: deps.cookie.secure,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: deps.cookie.maxAge,
  };

  // Signup routes - only registered if webauthn config is provided
  if (deps.signup) {
    await registerSignupRoutes(app, {
      signupService: deps.signup.signupService,
      passkeyService: deps.signup.passkeyService,
      completeSignup: deps.signup.completeSignup,
      sessionCookieName,
      cookieOptions,
      clientIpOf,
    }, rateLimitConfig);

    // Passkey management routes (for existing users to add/manage passkeys)
    await registerPasskeyRoutes(app, {
      passkeyService: deps.signup.passkeyService,
      sessionService: deps.signup.sessionService,
      tokenService: deps.signup.tokenService,
      sessionCookieName,
      cookieOptions,
      applyAuthenticatedRateLimit,
    });

    // Auth routes (login, logout, session)
    await registerAuthRoutes(app, {
      passkeyService: deps.signup.passkeyService,
      sessionService: deps.signup.sessionService,
      userService: deps.signup.userService,
      membershipService: deps.membershipService,
      organizationStore: deps.organizationStore,
      tokenService: deps.signup.tokenService,
      sessionCookieName,
      cookieOptions,
      clientIpOf,
      applyAuthenticatedRateLimit,
    }, rateLimitConfig);

    // Organization routes (switch, leave, members)
    await registerOrganizationRoutes(app, {
      sessionService: deps.signup.sessionService,
      membershipService: deps.membershipService,
      userService: deps.signup.userService,
      agentService: deps.signup.agentService,
      reissueAgentToken: deps.signup.reissueAgentToken,
      transferOwnership: deps.signup.transferOwnership,
      changeMemberRole: deps.signup.changeMemberRole,
      removeMember: deps.signup.removeMember,
      authMiddleware,
    });

    // User token self-service routes
    await registerTokenMutationRoutes(app, {
      tokenHandlers: deps.signup.tokenHandlers,
      sessionService: deps.signup.sessionService,
      tokenService: deps.signup.tokenService,
      sessionCookieName,
      applyAuthenticatedRateLimit,
    });
  }

  // Serve static files in production
  const publicPath = join(__dirname, '../public');
  const adminDistPath = join(publicPath, 'admin');
  const webDistPath = publicPath;
  
  // Cache control: hashed /assets/ can be immutable. HTML and PWA entry
  // files (sw.js, workbox-*.js, registerSW.js, manifest) must never cache
  // so a phone can notice a new build.
  const setHeaders = applyStaticCacheHeaders;

  // Serve web app at root (if build exists)
  if (existsSync(join(webDistPath, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      decorateReply: true,
      // Don't serve files that match API or admin routes
      serve: true,
      setHeaders,
    });
  }

  // Serve admin static files at /admin (if build exists)
  if (existsSync(adminDistPath)) {
    await app.register(fastifyStatic, {
      root: adminDistPath,
      prefix: '/admin/',
      decorateReply: false,
      setHeaders,
    });
  }

  // Register Sentry error handler (must be after routes but before other error handlers)
  Sentry.setupFastifyErrorHandler(app, { shouldHandleError });

  // SPA fallback. `/admin` is the admin app. `/admin-api` is not.
  // `/api`, `/test-api`, `/web-api`, and `/extension-api` are not the web app.
  // `/extension-api/v1`, `/web-api`, and `/admin-api` are mounted.
  app.setNotFoundHandler((request, reply) => {
    reply.header('Cache-Control', NEVER_CACHE_CONTROL);
    const decision = decideSpaFallback(request.url);
    if (decision === 'admin-spa' && existsSync(adminDistPath)) {
      return reply.sendFile('index.html', adminDistPath);
    }
    if (decision !== 'json-not-found' && existsSync(join(webDistPath, 'index.html'))) {
      return reply.sendFile('index.html', webDistPath);
    }
    return reply.status(404).send({ message: 'Not found' });
  });

  return app;
};
