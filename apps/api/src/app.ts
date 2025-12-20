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

  // Serve static files in production
  const publicPath = join(__dirname, '../public');
  const adminDistPath = join(publicPath, 'admin');
  const webDistPath = publicPath;
  
  // Serve web app at root (if build exists)
  if (existsSync(join(webDistPath, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      decorateReply: true,
      // Don't serve files that match API or admin routes
      serve: true,
    });
  }

  // Serve admin static files at /admin (if build exists)
  if (existsSync(adminDistPath)) {
    await app.register(fastifyStatic, {
      root: adminDistPath,
      prefix: '/admin/',
      decorateReply: false,
    });
  }

  // SPA fallback - serve index.html for unmatched routes
  app.setNotFoundHandler((request, reply) => {
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
