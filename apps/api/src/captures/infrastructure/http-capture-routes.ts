import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { captureContract, ProcessedToTypeSchema } from '@yoink/api-contracts';
import type { CaptureProcessingService } from '../../processing/application/create-processing-handlers.js';
import type { AuthMiddleware } from '../../access/application/index.js';
import type { CaptureHandlers } from '../application/create-capture-handlers.js';
import {
  invalidCursorHttp,
  toCaptureListBody,
} from '../../listing/infrastructure/http-listed-page.js';
import { projectRequestValidationError } from '../../projects/infrastructure/project-http-errors.js';
import { namedRequestValidationError } from '../../shared/infrastructure/request-validation-http.js';

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
          (page) => ({
            status: 200 as const,
            body: toCaptureListBody(page),
          }),
          (error) => {
            switch (error.type) {
              case 'INVALID_CURSOR':
                return invalidCursorHttp(error);
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
          listId: body.data.listId,
          projectId: body.data.projectId,
          actor: request.authContext.actor,
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
              case 'LIST_NOT_IN_ORGANIZATION':
                return {
                  status: 400 as const,
                  body: { message: 'List is not in this organization' },
                };
              case 'PROJECT_NOT_IN_ORGANIZATION':
                return {
                  status: 404 as const,
                  body: { message: 'Project not found' },
                };
              case 'PROJECT_DONE':
                return {
                  status: 400 as const,
                  body: { message: 'Cannot add a task to a done project' },
                };
              case 'PROJECT_PROPOSED':
                return {
                  status: 400 as const,
                  body: { message: 'A proposed project cannot have tasks' },
                };
              case 'ASSIGNEE_NOT_IN_ORGANIZATION':
                return {
                  status: 400 as const,
                  body: { message: 'Assignee is not a member of this organization' },
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

      processToProject: async ({ params, body, request }) => {
        const result = await captureProcessingService.processCaptureToProject({
          id: params.id,
          organizationId: request.authContext.organizationId,
          createdById: request.authContext.userId,
          name: body.name,
          objective: body.objective,
          status: body.status,
          actor: request.authContext.actor,
        });

        return result.match(
          (value) => ({
            status: 201 as const,
            body: value,
          }),
          (error) => {
            switch (error.type) {
              case 'PROJECT_CREATE_REQUIRES_PERSON':
                return {
                  status: 403 as const,
                  body: { message: error.message, code: error.type },
                };
              case 'DUPLICATE_PROJECT_NAME':
              case 'CAPTURE_NOT_IN_INBOX':
                return {
                  status: 409 as const,
                  body: {
                    message:
                      error.type === 'CAPTURE_NOT_IN_INBOX'
                        ? 'Capture must be in the inbox'
                        : error.message,
                    code: error.type,
                  },
                };
              case 'CAPTURE_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Capture not found', code: error.type },
                };
              case 'PROJECT_NAME_BLANK':
              case 'INVALID_PROJECT_NAME':
                return {
                  status: 400 as const,
                  body: { message: error.message, code: error.type },
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
      requestValidationErrorHandler: (err, request, reply) => {
        if (request.url.includes('/process-to-project')) {
          return reply.status(400).send(projectRequestValidationError(err));
        }
        return reply.status(400).send(namedRequestValidationError(err));
      },
    });
  });
};
