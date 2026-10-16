import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import * as Sentry from '@sentry/node';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHealthRoutes } from './health/application/index.js';
import { registerCaptureRoutes } from './captures/infrastructure/http-capture-routes.js';
import { registerListRoutes } from './lists/infrastructure/http-list-routes.js';
import { registerProjectRoutes } from './projects/infrastructure/http-project-routes.js';
import { registerNoteRoutes } from './notes/infrastructure/http-note-routes.js';
import { registerTaskRoutes } from './tasks/infrastructure/http-task-routes.js';
import { registerWorkRoutes } from './work/infrastructure/http-work-routes.js';
import { registerReviewRoutes } from './review/infrastructure/http-review-routes.js';
import { registerReviewFixtureRoutes } from './review/infrastructure/http-review-fixture-routes.js';
import {
  registerAdminRoutes,
  registerInvitationRoutes,
  registerSignupRoutes,
  registerPasskeyRoutes,
  registerAuthRoutes,
  registerOrganizationRoutes,
  registerTokenRoutes,
  type AuthMiddleware,
  type ReissueAgentToken,
} from './access/application/index.js';
import type { TokenHandlers } from './access/application/create-token-handlers.js';
import type { CaptureHandlers } from './captures/application/index.js';
import type { ListHandlers } from './lists/application/index.js';
import type { ProjectHandlers } from './projects/application/index.js';
import type { NoteHandlers } from './notes/application/create-note-handlers.js';
import type { HistoryHandlers } from './history/application/create-history-handlers.js';
import type { TaskService } from './tasks/domain/task-service.js';
import type { TaskHandlers } from './tasks/application/index.js';
import type { WorkHandlers } from './work/application/create-work-handlers.js';
import type { ReviewHandlers } from './review/application/create-review-handlers.js';
import type { CaptureProcessingService } from './processing/application/create-processing-handlers.js';
import type { HealthChecker } from './health/domain/health-checker.js';
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
import {
  DEFAULT_GLOBAL_RATE_LIMIT_MAX,
  type RateLimitConfig,
  type LogConfig,
  type CookieConfig,
} from './config/schema.js';
import type { Database } from './database/types.js';
import { createLoggerOptions } from './logging/index.js';
import { shouldHandleError } from './logging/should-handle-error.js';
import { applyStaticCacheHeaders, NEVER_CACHE_CONTROL } from './static-cache-control.js';
import type { ResolveRateLimitPrincipal } from './access/application/index.js';
import {
  decideRateLimitExempt,
  decideRateLimitKey,
  firstHeaderValue,
} from './shared/rate-limit-policy.js';
import { clientIpOfRequest, type ClientIpOf } from './shared/request-client-ip.js';
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Trust only the last proxy hop (Fly). Do not trust client-set X-Forwarded-For. */
export const TRUST_PROXY_HOPS = 1;

export type AdminConfig = {
  adminService: AdminService;
  adminSessionService: AdminSessionService;
  invitationService: InvitationService;
};

export type SignupConfig = {
  signupService: SignupService;
  passkeyService: PasskeyService;
  sessionService: SessionService;
  tokenService: TokenService;
  userService: UserService;
  tokenHandlers: TokenHandlers;
  agentService: AgentService;
  reissueAgentToken: ReissueAgentToken;
};

export type AppDependencies = {
  captureHandlers: CaptureHandlers;
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
  signup?: SignupConfig;
  admin?: AdminConfig;
  rateLimit?: RateLimitConfig;
  log: LogConfig;
  cookie: CookieConfig;
  app?: FastifyInstance;
  /** True only when the process is running behind Fly (FLY_ALLOC_ID / FLY_APP_NAME). */
  viaFly?: boolean;
  resolveRateLimitPrincipal?: ResolveRateLimitPrincipal;
};

export const createFastifyInstance = (log: LogConfig): FastifyInstance =>
  Fastify({ logger: createLoggerOptions(log), trustProxy: TRUST_PROXY_HOPS });

// Default rate limit configuration
const defaultRateLimitConfig: RateLimitConfig = {
  enabled: true,
  globalMax: DEFAULT_GLOBAL_RATE_LIMIT_MAX,
  globalTimeWindow: '1 minute',
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

  // Register security plugins
  await app.register(helmet, {
    // Configure Content Security Policy for SPA serving
    contentSecurityPolicy: false, // Disable CSP for now (SPA needs inline scripts from Vite)
  });

  await app.register(cookie);

  // Only register global rate limiting if enabled
  if (rateLimitConfig.enabled) {
    const sessionCookieName = deps.cookie.sessionName;
    const resolvePrincipal = deps.resolveRateLimitPrincipal;
    await app.register(rateLimit, {
      global: true,
      max: rateLimitConfig.globalMax,
      timeWindow: rateLimitConfig.globalTimeWindow,
      keyGenerator: async (request) => {
        const clientIp = clientIpOf(request);
        const userId =
          resolvePrincipal === undefined
            ? undefined
            : await resolvePrincipal({
                cookieHeader: firstHeaderValue(request.headers.cookie),
                authorization: firstHeaderValue(request.headers.authorization),
                sessionCookieName,
              });
        return decideRateLimitKey({ clientIp, userId }).key;
      },
      allowList: (request) => decideRateLimitExempt({ url: request.url }).exempt,
    });
  }

  // Register routes
  await registerHealthRoutes(app, { healthChecker: deps.healthChecker });
  await registerCaptureRoutes(app, {
    captureHandlers: deps.captureHandlers,
    captureProcessingService: deps.captureProcessingService,
    authMiddleware: deps.authMiddleware,
  });
  await registerListRoutes(app, {
    listHandlers: deps.listHandlers,
    authMiddleware: deps.authMiddleware,
  });
  await registerProjectRoutes(app, {
    projectHandlers: deps.projectHandlers,
    historyHandlers: deps.historyHandlers,
    authMiddleware: deps.authMiddleware,
  });
  await registerNoteRoutes(app, {
    noteHandlers: deps.noteHandlers,
    authMiddleware: deps.authMiddleware,
  });
  await registerTaskRoutes(app, {
    taskService: deps.taskService,
    taskHandlers: deps.taskHandlers,
    historyHandlers: deps.historyHandlers,
    authMiddleware: deps.authMiddleware,
  });
  await registerWorkRoutes(app, {
    workHandlers: deps.workHandlers,
    authMiddleware: deps.authMiddleware,
  });
  await registerReviewRoutes(app, {
    reviewHandlers: deps.reviewHandlers,
    authMiddleware: deps.authMiddleware,
  });
  if (deps.enableTestFixtures && deps.database) {
    await registerReviewFixtureRoutes(app, {
      authMiddleware: deps.authMiddleware,
      db: deps.database,
    });
  }

  // Admin routes - only registered if admin config is provided
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
    authMiddleware: deps.authMiddleware,
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
      sessionService: deps.signup.sessionService,
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
    }, rateLimitConfig);

    // Organization routes (switch, leave, members)
    await registerOrganizationRoutes(app, {
      sessionService: deps.signup.sessionService,
      membershipService: deps.membershipService,
      userService: deps.signup.userService,
      agentService: deps.signup.agentService,
      reissueAgentToken: deps.signup.reissueAgentToken,
      authMiddleware: deps.authMiddleware,
    });

    // User token self-service routes
    await registerTokenRoutes(app, {
      tokenHandlers: deps.signup.tokenHandlers,
      sessionService: deps.signup.sessionService,
      tokenService: deps.signup.tokenService,
      sessionCookieName,
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

  // SPA fallback - serve index.html for unmatched routes
  app.setNotFoundHandler((request, reply) => {
    // Set no-cache for HTML fallback responses
    reply.header('Cache-Control', NEVER_CACHE_CONTROL);
    
    // Admin SPA routes
    if (request.url.startsWith('/admin')) {
      if (existsSync(adminDistPath)) {
        return reply.sendFile('index.html', adminDistPath);
      }
    }
    // Web app SPA routes (not API routes)
    if (!request.url.startsWith('/api') && existsSync(join(webDistPath, 'index.html'))) {
      return reply.sendFile('index.html', webDistPath);
    }
    return reply.status(404).send({ message: 'Not found' });
  });

  return app;
};
