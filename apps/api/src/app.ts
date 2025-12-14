import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHealthRoutes } from './health/application/index.js';
import { registerCaptureRoutes } from './captures/application/index.js';
import { registerAdminRoutes } from './admin/application/index.js';
import type { CaptureService } from './captures/domain/capture-service.js';
import type { HealthChecker } from './health/domain/health-checker.js';
import type { AuthMiddleware } from './auth/application/auth-middleware.js';
import type { AdminService } from './admin/domain/admin-service.js';
import type { AdminSessionService } from './admin/domain/admin-session-service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type AdminConfig = {
  adminService: AdminService;
  adminSessionService: AdminSessionService;
};

export type AppDependencies = {
  captureService: CaptureService;
  authMiddleware: AuthMiddleware;
  healthChecker: HealthChecker;
  admin?: AdminConfig;
};

export const createApp = async (deps: AppDependencies) => {
  const app = Fastify();

  // Register plugins
  await app.register(cookie);

  // Register routes
  await registerHealthRoutes(app, { healthChecker: deps.healthChecker });
  await registerCaptureRoutes(app, {
    captureService: deps.captureService,
    authMiddleware: deps.authMiddleware,
  });

  // Admin routes - only registered if admin config is provided
  if (deps.admin) {
    await registerAdminRoutes(app, deps.admin);
  }

  // Serve admin static files in production (if build exists)
  const adminDistPath = join(__dirname, '../public/admin');
  if (existsSync(adminDistPath)) {
    await app.register(fastifyStatic, {
      root: adminDistPath,
      prefix: '/admin/',
      decorateReply: false,
    });

    // SPA fallback - serve index.html for unmatched /admin/* routes
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/admin')) {
        return reply.sendFile('index.html', adminDistPath);
      }
      return reply.status(404).send({ message: 'Not found' });
    });
  }

  return app;
};
