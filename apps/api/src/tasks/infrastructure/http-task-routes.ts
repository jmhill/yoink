import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { taskContract } from '@yoink/api-contracts';
import type { TaskService } from '../domain/task-service.js';
import type { AuthMiddleware } from '../../access/application/index.js';
import type { TaskHandlers } from '../application/create-task-handlers.js';
import { invalidCursorHttp, toTaskListBody } from '../../listing/infrastructure/http-listed-page.js';

export type TaskRoutesDependencies = {
  taskService: TaskService;
  taskHandlers: TaskHandlers;
  authMiddleware: AuthMiddleware;
};

export const registerTaskRoutes = async (
  app: FastifyInstance,
  deps: TaskRoutesDependencies
) => {
  const { taskService, taskHandlers, authMiddleware } = deps;
  const s = initServer();

  // Authenticated routes - scoped plugin with auth hook
  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    const taskRouter = s.router(taskContract, {
      create: async ({ body, request }) => {
        const result = await taskHandlers.create({
          title: body.title,
          dueDate: body.dueDate,
          assigneeId: body.assigneeId,
          listId: body.listId,
          organizationId: request.authContext.organizationId,
          createdById: request.authContext.userId,
          // TODO(#132): pass request.authContext.actor once PR 151 merges
          actor: null,
        });

        return result.match(
          ({ view }) => ({
            status: 201 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'ASSIGNEE_NOT_IN_ORGANIZATION':
                return {
                  status: 400 as const,
                  body: { message: 'Assignee is not a member of this organization' },
                };
              case 'LIST_NOT_IN_ORGANIZATION':
                return {
                  status: 400 as const,
                  body: { message: 'List is not in this organization' },
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

      list: async ({ query, request }) => {
        const result = await taskHandlers.list({
          organizationId: request.authContext.organizationId,
          filter: query.filter,
          limit: query.limit,
          cursor: query.cursor,
          callerId: request.authContext.userId,
        });

        return result.match(
          (page) => ({
            status: 200 as const,
            body: toTaskListBody(page),
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
        const result = await taskHandlers.update({
          id: params.id,
          organizationId: request.authContext.organizationId,
          title: body.title,
          dueDate: body.dueDate,
          assigneeId: body.assigneeId,
          listId: body.listId,
          // TODO(#132): pass request.authContext.actor once PR 151 merges
          actor: null,
        });

        return result.match(
          ({ view }) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'TASK_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: { message: 'Task not found' },
                };
              case 'ASSIGNEE_NOT_IN_ORGANIZATION':
                return {
                  status: 400 as const,
                  body: { message: 'Assignee is not a member of this organization' },
                };
              case 'LIST_NOT_IN_ORGANIZATION':
                return {
                  status: 400 as const,
                  body: { message: 'List is not in this organization' },
                };
              case 'TASK_NOT_OPEN':
                return {
                  status: 400 as const,
                  body: { message: 'Only open tasks can be added to or taken off a list' },
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
        const result = await taskHandlers.complete({
          id: params.id,
          organizationId: request.authContext.organizationId,
          // TODO(#132): pass request.authContext.actor once PR 151 merges
          actor: null,
        });

        return result.match(
          ({ view }) => ({
            status: 200 as const,
            body: view,
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
        const result = await taskHandlers.uncomplete({
          id: params.id,
          organizationId: request.authContext.organizationId,
          // TODO(#132): pass request.authContext.actor once PR 151 merges
          actor: null,
        });

        return result.match(
          ({ view }) => ({
            status: 200 as const,
            body: view,
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
        const result = await taskHandlers.pin({
          id: params.id,
          organizationId: request.authContext.organizationId,
          // TODO(#132): pass request.authContext.actor once PR 151 merges
          actor: null,
        });

        return result.match(
          ({ view }) => ({
            status: 200 as const,
            body: view,
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
        const result = await taskHandlers.unpin({
          id: params.id,
          organizationId: request.authContext.organizationId,
          // TODO(#132): pass request.authContext.actor once PR 151 merges
          actor: null,
        });

        return result.match(
          ({ view }) => ({
            status: 200 as const,
            body: view,
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
        const result = await taskHandlers.delete({
          id: params.id,
          organizationId: request.authContext.organizationId,
          // TODO(#132): pass request.authContext.actor once PR 151 merges
          actor: null,
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
