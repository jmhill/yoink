import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { taskContract } from '@yoink/api-contracts';
import type { TaskService } from '../domain/task-service.js';
import type { CaptureProcessingService } from '../../processing/domain/processing-service.js';
import type { AuthMiddleware } from '../../auth/application/auth-middleware.js';

export type TaskRoutesDependencies = {
  taskService: TaskService;
  captureProcessingService: CaptureProcessingService;
  authMiddleware: AuthMiddleware;
};

export const registerTaskRoutes = async (
  app: FastifyInstance,
  deps: TaskRoutesDependencies
) => {
  const { taskService, captureProcessingService, authMiddleware } = deps;
  const s = initServer();

  // Authenticated routes - scoped plugin with auth hook
  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    const taskRouter = s.router(taskContract, {
      create: async ({ body, request }) => {
        const result = await taskService.create({
          title: body.title,
          dueDate: body.dueDate,
          organizationId: request.authContext.organizationId,
          createdById: request.authContext.userId,
        });

        return result.match(
          (task) => ({
            status: 201 as const,
            body: task,
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
        const result = await taskService.list({
          organizationId: request.authContext.organizationId,
          filter: query.filter,
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
        const result = await taskService.find({
          id: params.id,
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          (task) => ({
            status: 200 as const,
            body: task,
          }),
          (error) => {
            switch (error.type) {
              case 'TASK_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Task not found' },
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
        const result = await taskService.update({
          id: params.id,
          organizationId: request.authContext.organizationId,
          title: body.title,
          dueDate: body.dueDate,
        });

        return result.match(
          (task) => ({
            status: 200 as const,
            body: task,
          }),
          (error) => {
            switch (error.type) {
              case 'TASK_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Task not found' },
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

      complete: async ({ params, request }) => {
        const result = await taskService.complete({
          id: params.id,
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          (task) => ({
            status: 200 as const,
            body: task,
          }),
          (error) => {
            switch (error.type) {
              case 'TASK_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Task not found' },
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

      uncomplete: async ({ params, request }) => {
        const result = await taskService.uncomplete({
          id: params.id,
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          (task) => ({
            status: 200 as const,
            body: task,
          }),
          (error) => {
            switch (error.type) {
              case 'TASK_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Task not found' },
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
        const result = await taskService.pin({
          id: params.id,
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          (task) => ({
            status: 200 as const,
            body: task,
          }),
          (error) => {
            switch (error.type) {
              case 'TASK_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Task not found' },
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
        const result = await taskService.unpin({
          id: params.id,
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          (task) => ({
            status: 200 as const,
            body: task,
          }),
          (error) => {
            switch (error.type) {
              case 'TASK_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Task not found' },
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
        // Use captureProcessingService for cascade delete (deletes source capture too)
        const result = await captureProcessingService.deleteTaskWithCascade({
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
              case 'TASK_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Task not found' },
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

    s.registerRouter(taskContract, taskRouter, authedApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send({ message: err.message });
      },
    });
  });
};
