import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { captureContract, healthContract } from '@yoink/api-contracts';
import type { CaptureService } from './captures/domain/capture-service.js';
import type { HealthChecker } from './health/domain/health-checker.js';

export type AuthMiddleware = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

export type AppDependencies = {
  captureService: CaptureService;
  authMiddleware: AuthMiddleware;
  healthChecker: HealthChecker;
};

export const createApp = async (deps: AppDependencies) => {
  const app = Fastify();
  const s = initServer();

  // Health route - registered at app level (no auth)
  const healthRouter = s.router(healthContract, {
    check: async () => {
      const health = await deps.healthChecker.check();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      return {
        status: statusCode as 200 | 503,
        body: health,
      };
    },
  });

  s.registerRouter(healthContract, healthRouter, app, {
    responseValidation: true,
  });

  // Authenticated routes - scoped plugin with auth hook
  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', deps.authMiddleware);

    const captureRouter = s.router(captureContract, {
      create: async ({ body, request }) => {
        const result = await deps.captureService.create({
          content: body.content,
          title: body.title,
          sourceUrl: body.sourceUrl,
          sourceApp: body.sourceApp,
          organizationId: request.authContext.organizationId,
          createdById: request.authContext.userId,
        });

        return result.match(
          (capture) => ({
            status: 201 as const,
            body: capture,
          }),
          (error) => {
            switch (error.type) {
              case 'STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      list: async ({ query, request }) => {
        const result = await deps.captureService.list({
          organizationId: request.authContext.organizationId,
          status: query.status,
          limit: query.limit,
          cursor: query.cursor,
        });

        return result.match(
          (data) => ({
            status: 200 as const,
            body: data,
          }),
          (error) => {
            switch (error.type) {
              case 'STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      get: async ({ params, request }) => {
        const result = await deps.captureService.findById({
          id: params.id,
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          (capture) => ({
            status: 200 as const,
            body: capture,
          }),
          (error) => {
            switch (error.type) {
              case 'CAPTURE_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Capture not found' },
                };
              case 'STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      update: async ({ params, body, request }) => {
        const result = await deps.captureService.update({
          id: params.id,
          organizationId: request.authContext.organizationId,
          title: body.title,
          content: body.content,
          status: body.status,
        });

        return result.match(
          (capture) => ({
            status: 200 as const,
            body: capture,
          }),
          (error) => {
            switch (error.type) {
              case 'CAPTURE_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Capture not found' },
                };
              case 'STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },
    });

    s.registerRouter(captureContract, captureRouter, authedApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send({ message: err.message });
      },
    });
  });

  return app;
};
