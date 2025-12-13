import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { captureContract } from '@yoink/api-contracts';
import type { CaptureService } from './captures/domain/capture-service.js';

export type AuthMiddleware = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

export type AppDependencies = {
  captureService: CaptureService;
  authMiddleware: AuthMiddleware;
};

export const createApp = async (deps: AppDependencies) => {
  const app = Fastify();

  app.addHook('preHandler', deps.authMiddleware);

  const s = initServer();

  const router = s.router(captureContract, {
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
