import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { captureContract } from '@yoink/api-contracts';
import type { CaptureService } from '../domain/capture-service.js';
import type { AuthMiddleware } from '../../auth/application/auth-middleware.js';

export type CaptureRoutesDependencies = {
  captureService: CaptureService;
  authMiddleware: AuthMiddleware;
};

export const registerCaptureRoutes = async (
  app: FastifyInstance,
  deps: CaptureRoutesDependencies
) => {
  const { captureService, authMiddleware } = deps;
  const s = initServer();

  // Authenticated routes - scoped plugin with auth hook
  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    const captureRouter = s.router(captureContract, {
      create: async ({ body, request }) => {
        const result = await captureService.create({
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
        const result = await captureService.list({
          organizationId: request.authContext.organizationId,
          status: query.status,
          snoozed: query.snoozed,
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
        const result = await captureService.findById({
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
        const result = await captureService.update({
          id: params.id,
          organizationId: request.authContext.organizationId,
          title: body.title,
          content: body.content,
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

      trash: async ({ params, request }) => {
        const result = await captureService.trash({
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

      restore: async ({ params, request }) => {
        const result = await captureService.restore({
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

      pin: async ({ params, request }) => {
        const result = await captureService.pin({
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
              case 'CAPTURE_ALREADY_TRASHED':
                return {
                  status: 404 as const,
                  body: { message: 'Cannot pin a trashed capture' },
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

      unpin: async ({ params, request }) => {
        const result = await captureService.unpin({
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

      snooze: async ({ params, body, request }) => {
        const result = await captureService.snooze({
          id: params.id,
          organizationId: request.authContext.organizationId,
          until: body.until,
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
              case 'CAPTURE_ALREADY_TRASHED':
                return {
                  status: 400 as const,
                  body: { message: 'Cannot snooze a trashed capture' },
                };
              case 'INVALID_SNOOZE_TIME':
                return {
                  status: 400 as const,
                  body: { message: error.message },
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

      unsnooze: async ({ params, request }) => {
        const result = await captureService.unsnooze({
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

      delete: async ({ params, request }) => {
        const result = await captureService.delete({
          id: params.id,
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          () => ({
            status: 204 as const,
            body: undefined,
          }),
          (error) => {
            switch (error.type) {
              case 'CAPTURE_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Capture not found' },
                };
              case 'CAPTURE_NOT_IN_TRASH':
                return {
                  status: 409 as const,
                  body: { message: 'Capture must be in trash before it can be deleted' },
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

      emptyTrash: async ({ request }) => {
        const result = await captureService.emptyTrash({
          organizationId: request.authContext.organizationId,
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

    s.registerRouter(captureContract, captureRouter, authedApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send({ message: err.message });
      },
    });
  });
};
