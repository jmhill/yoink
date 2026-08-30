import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { captureContract, ProcessedToTypeSchema } from '@yoink/api-contracts';
import type { CaptureProcessingService } from '../../processing/domain/processing-service.js';
import type { AuthMiddleware } from '../../access/application/index.js';
import type { CaptureHandlers } from '../application/create-capture-handlers.js';

export type CaptureRoutesDependencies = {
  captureHandlers: CaptureHandlers;
  captureProcessingService: CaptureProcessingService;
  authMiddleware: AuthMiddleware;
};

export const registerCaptureRoutes = async (
  app: FastifyInstance,
  deps: CaptureRoutesDependencies
) => {
  const { captureHandlers, captureProcessingService, authMiddleware } = deps;
  const s = initServer();

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    const captureRouter = s.router(captureContract, {
      create: async ({ body, request }) => {
        if (request.authContext.principalKind === 'agent') {
          return {
            status: 403 as const,
            body: { message: 'Agents cannot create captures' },
          };
        }

        const result = await captureHandlers.create({
          content: body.content,
          title: body.title,
          sourceUrl: body.sourceUrl,
          sourceApp: body.sourceApp,
          organizationId: request.authContext.organizationId,
          createdById: request.authContext.userId,
        });

        return result.match(
          ({ view }) => ({
            status: 201 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'STORAGE_ERROR':
              default:
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      list: async ({ query, request }) => {
        const result = await captureHandlers.list({
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
              default:
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      get: async ({ params, request }) => {
        const result = await captureHandlers.find({
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
              default:
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      update: async ({ params, body, request }) => {
        const result = await captureHandlers.update({
          id: params.id,
          organizationId: request.authContext.organizationId,
          title: body.title,
          content: body.content,
        });

        return result.match(
          ({ view }) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'CAPTURE_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Capture not found' },
                };
              case 'STORAGE_ERROR':
              default:
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      trash: async ({ params, request }) => {
        const result = await captureHandlers.trash({
          id: params.id,
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          ({ view }) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'CAPTURE_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Capture not found' },
                };
              case 'STORAGE_ERROR':
              default:
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      restore: async ({ params, request }) => {
        const result = await captureHandlers.restore({
          id: params.id,
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          ({ view }) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'CAPTURE_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Capture not found' },
                };
              case 'STORAGE_ERROR':
              default:
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      snooze: async ({ params, body, request }) => {
        const result = await captureHandlers.snooze({
          id: params.id,
          organizationId: request.authContext.organizationId,
          until: body.until,
        });

        return result.match(
          ({ view }) => ({
            status: 200 as const,
            body: view,
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
              default:
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      unsnooze: async ({ params, request }) => {
        const result = await captureHandlers.unsnooze({
          id: params.id,
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          ({ view }) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'CAPTURE_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Capture not found' },
                };
              case 'STORAGE_ERROR':
              default:
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      delete: async ({ params, request }) => {
        const result = await captureHandlers.delete({
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
              default:
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      emptyTrash: async ({ request }) => {
        const result = await captureHandlers.emptyTrash({
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          (result) => ({
            status: 200 as const,
            body: { deletedCount: result.deletedCount },
          }),
          (error) => {
            switch (error.type) {
              case 'STORAGE_ERROR':
              default:
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      process: async ({ params, body, request }) => {
        if (body.type !== ProcessedToTypeSchema.enum.task) {
          return {
            status: 400 as const,
            body: { message: 'Unsupported processing type' },
          };
        }

        const result = await captureProcessingService.processCaptureToTask({
          id: params.id,
          organizationId: request.authContext.organizationId,
          createdById: request.authContext.userId,
          title: body.data.title,
          dueDate: body.data.dueDate,
        });

        return result.match(
          (task) => ({
            status: 201 as const,
            body: task,
          }),
          (error) => {
            switch (error.type) {
              case 'CAPTURE_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Capture not found' },
                };
              case 'CAPTURE_NOT_IN_INBOX':
                return {
                  status: 400 as const,
                  body: { message: 'Capture must be in inbox to be processed' },
                };
              case 'STORAGE_ERROR':
              default:
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
