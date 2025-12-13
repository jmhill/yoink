import Fastify from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { captureContract } from '@yoink/api-contracts';
import { authMiddleware } from './auth/application/auth-middleware.js';
import type { CaptureService } from './captures/domain/capture-service.js';

export type AppDependencies = {
  captureService: CaptureService;
};

export const createApp = async (deps: AppDependencies) => {
  const app = Fastify();

  app.addHook('preHandler', authMiddleware);

  const s = initServer();

  const router = s.router(captureContract, {
    create: async ({ body, request }) => {
      const capture = await deps.captureService.create({
        content: body.content,
        title: body.title,
        sourceUrl: body.sourceUrl,
        sourceApp: body.sourceApp,
        organizationId: request.authContext.organizationId,
        createdById: request.authContext.userId,
      });

      return {
        status: 201,
        body: capture,
      };
    },

    list: async ({ query, request }) => {
      const result = await deps.captureService.list({
        organizationId: request.authContext.organizationId,
        status: query.status,
        limit: query.limit,
        cursor: query.cursor,
      });

      return {
        status: 200,
        body: result,
      };
    },
  });

  s.registerRouter(captureContract, router, app, {
    jsonQuery: true,
    responseValidation: true,
    requestValidationErrorHandler: (err, _request, reply) => {
      return reply.status(400).send({ message: err.message });
    },
  });

  return app;
};
