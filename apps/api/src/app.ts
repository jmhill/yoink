import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import * as Sentry from '@sentry/node';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHealthRoutes } from './health/application/index.js';
import { registerCaptureRoutes } from './captures/application/index.js';
import { registerTaskRoutes } from './tasks/application/index.js';
import { registerAdminRoutes } from './admin/application/index.js';
import type { CaptureService } from './captures/domain/capture-service.js';
import type { TaskService } from './tasks/domain/task-service.js';
import type { CaptureProcessingService } from './processing/domain/processing-service.js';
import type { HealthChecker } from './health/domain/health-checker.js';
import type { AuthMiddleware } from './auth/application/auth-middleware.js';
import type { AdminService } from './admin/domain/admin-service.js';
import type { AdminSessionService } from './admin/domain/admin-session-service.js';
import type { RateLimitConfig, LogConfig, CookieConfig } from './config/schema.js';
import { createLoggerOptions } from './logging/index.js';
import type { InvitationService } from './organizations/domain/invitation-service.js';
import type { MembershipService } from './organizations/domain/membership-service.js';
import type { OrganizationStore } from './organizations/domain/organization-store.js';
import type { SignupService } from './auth/domain/signup-service.js';
import type { PasskeyService } from './auth/domain/passkey-service.js';
import type { SessionService } from './auth/domain/session-service.js';
import type { TokenService } from './auth/domain/token-service.js';
import { registerInvitationRoutes } from './invitations/application/invitation-routes.js';
import { registerSignupRoutes } from './auth/application/signup-routes.js';
import { registerPasskeyRoutes } from './auth/application/passkey-routes.js';
import { registerAuthRoutes } from './auth/application/auth-routes.js';
import { registerOrganizationRoutes } from './organizations/application/organization-routes.js';
import type { UserService } from './users/domain/user-service.js';
const __dirname = dirname(fileURLToPath(import.meta.url));

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
};

export type AppDependencies = {
  captureService: CaptureService;
  taskService: TaskService;
  captureProcessingService: CaptureProcessingService;
  authMiddleware: AuthMiddleware;
  healthChecker: HealthChecker;
  invitationService: InvitationService;
  membershipService: MembershipService;
  organizationStore: OrganizationStore;
  signup?: SignupConfig;
  admin?: AdminConfig;
  rateLimit?: RateLimitConfig;
  log: LogConfig;
  cookie: CookieConfig;
};

// Default rate limit configuration
const defaultRateLimitConfig: RateLimitConfig = {
  enabled: true,
  globalMax: 100,
  globalTimeWindow: '1 minute',
  adminLoginMax: 5,
  adminLoginTimeWindow: '15 minutes',
  authLoginMax: 10,
  authLoginTimeWindow: '15 minutes',
  signupMax: 5,
  signupTimeWindow: '1 hour',
};

export const createApp = async (deps: AppDependencies) => {
  const loggerOptions = createLoggerOptions(deps.log);
  const app = Fastify({ logger: loggerOptions });
  const rateLimitConfig = deps.rateLimit ?? defaultRateLimitConfig;

  // Register security plugins
  await app.register(helmet, {
    // Configure Content Security Policy for SPA serving
    contentSecurityPolicy: false, // Disable CSP for now (SPA needs inline scripts from Vite)
  });

  // Only register global rate limiting if enabled
  if (rateLimitConfig.enabled) {
    await app.register(rateLimit, {
      global: true,
      max: rateLimitConfig.globalMax,
      timeWindow: rateLimitConfig.globalTimeWindow,
    });
  }

  // Register other plugins
  await app.register(cookie);

  // Register routes
  await registerHealthRoutes(app, { healthChecker: deps.healthChecker });
  await registerCaptureRoutes(app, {
    captureService: deps.captureService,
    captureProcessingService: deps.captureProcessingService,
    authMiddleware: deps.authMiddleware,
  });
  await registerTaskRoutes(app, {
    taskService: deps.taskService,
    captureProcessingService: deps.captureProcessingService,
    authMiddleware: deps.authMiddleware,
  });

  // Admin routes - only registered if admin config is provided
  if (deps.admin) {
    await registerAdminRoutes(app, { ...deps.admin, cookieConfig: deps.cookie }, rateLimitConfig);
  }

  // Invitation routes
  await registerInvitationRoutes(app, {
    invitationService: deps.invitationService,
    membershipService: deps.membershipService,
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
    }, rateLimitConfig);

    // Organization routes (switch, leave, members)
    await registerOrganizationRoutes(app, {
      sessionService: deps.signup.sessionService,
      membershipService: deps.membershipService,
      userService: deps.signup.userService,
      authMiddleware: deps.authMiddleware,
    });
  }

  // Serve static files in production
  const publicPath = join(__dirname, '../public');
  const adminDistPath = join(publicPath, 'admin');
  const webDistPath = publicPath;
  
  // Cache control: assets have hashes so can be cached long-term,
  // but HTML files should not be cached to ensure fresh deploys work
  const setHeaders = (res: { setHeader: (name: string, value: string) => void }, path: string) => {
    if (path.endsWith('.html')) {
      // Don't cache HTML - ensures users get latest app version
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (path.includes('/assets/')) {
      // Assets have content hashes - cache for 1 year
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  };

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
  Sentry.setupFastifyErrorHandler(app);

  // SPA fallback - serve index.html for unmatched routes
  app.setNotFoundHandler((request, reply) => {
    // Set no-cache for HTML fallback responses
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    
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
