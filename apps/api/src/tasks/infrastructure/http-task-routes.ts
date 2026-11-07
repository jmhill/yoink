import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { taskOrpcContract } from '@yoink/api-contracts/orpc';
import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import type { HistoryHandlers } from '../../modules/history/index.js';
import { toTaskListBody } from '../../edges/_shared/http-listed-page.js';
import { dispatchOrpc } from '../../edges/_shared/orpc/dispatch.js';
import { openApiHandlerOptions } from '../../edges/_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../edges/_shared/orpc/http-context.js';
import { listedRequestValidationError } from '../../edges/_shared/request-validation.js';
import type { TaskHandlers } from '../application/create-task-handlers.js';
import type { TaskService } from '../domain/task-service.js';
import {
  mapCompleteTaskError,
  mapCreateTaskError,
  mapDeleteTaskError,
  mapFindTaskError,
  mapListTaskHistoryError,
  mapListTasksError,
  mapPinTaskError,
  mapUncompleteTaskError,
  mapUnpinTaskError,
  mapUpdateTaskError,
} from './orpc-task-errors.js';

export type TaskRoutesDependencies = {
  taskService: TaskService;
  taskHandlers: TaskHandlers;
  historyHandlers: HistoryHandlers;
  authMiddleware: AuthMiddleware;
};

type TaskHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export const registerTaskRoutes = async (
  app: FastifyInstance,
  deps: TaskRoutesDependencies
) => {
  const tasks = implement(taskOrpcContract).$context<OrpcHttpContext>();
  const router = tasks.router({
    create: tasks.create.handler(async ({ input, context }) => {
      const result = await deps.taskHandlers.create({
        title: input.title,
        dueDate: input.dueDate,
        assigneeId: input.assigneeId,
        listId: input.listId,
        projectId: input.projectId,
        organizationId: context.request.authContext.organizationId,
        createdById: context.request.authContext.userId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapCreateTaskError(error);
        }
      );
    }),
    list: tasks.list.handler(async ({ input, context }) => {
      const result = await deps.taskHandlers.list({
        organizationId: context.request.authContext.organizationId,
        filter: input.filter,
        limit: input.limit,
        cursor: input.cursor,
        callerId: context.request.authContext.userId,
        timeZone: input.timeZone,
      });

      return result.match(
        (page) => toTaskListBody(page),
        (error) => {
          throw mapListTasksError(error);
        }
      );
    }),
    get: tasks.get.handler(async ({ input, context }) => {
      const result = await deps.taskService.find({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
      });

      return result.match(
        (task) => task,
        (error) => {
          throw mapFindTaskError(error);
        }
      );
    }),
    update: tasks.update.handler(async ({ input, context }) => {
      const result = await deps.taskHandlers.update({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        title: input.title,
        dueDate: input.dueDate,
        assigneeId: input.assigneeId,
        listId: input.listId,
        projectId: input.projectId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapUpdateTaskError(error);
        }
      );
    }),
    complete: tasks.complete.handler(async ({ input, context }) => {
      const result = await deps.taskHandlers.complete({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapCompleteTaskError(error);
        }
      );
    }),
    uncomplete: tasks.uncomplete.handler(async ({ input, context }) => {
      const result = await deps.taskHandlers.uncomplete({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapUncompleteTaskError(error);
        }
      );
    }),
    pin: tasks.pin.handler(async ({ input, context }) => {
      const result = await deps.taskHandlers.pin({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapPinTaskError(error);
        }
      );
    }),
    unpin: tasks.unpin.handler(async ({ input, context }) => {
      const result = await deps.taskHandlers.unpin({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapUnpinTaskError(error);
        }
      );
    }),
    listHistory: tasks.listHistory.handler(async ({ input, context }) => {
      const result = await deps.historyHandlers.listTaskHistory({
        taskId: input.id,
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
      });

      return result.match(
        (page) => page,
        (error) => {
          throw mapListTaskHistoryError(error);
        }
      );
    }),
    delete: tasks.delete.handler(async ({ input, context }) => {
      const result = await deps.taskHandlers.delete({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        () => undefined,
        (error) => {
          throw mapDeleteTaskError(error);
        }
      );
    }),
  });

  const handler = new OpenAPIHandler(router, openApiHandlerOptions(listedRequestValidationError));

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', deps.authMiddleware);

    const mount = (method: TaskHttpMethod | TaskHttpMethod[], url: string) => {
      authedApp.route({
        method,
        url,
        handler: async (request, reply) => dispatchOrpc(handler, request, reply),
      });
    };

    mount(['GET', 'POST'], '/api/tasks');
    mount('POST', '/api/tasks/:id/complete');
    mount('POST', '/api/tasks/:id/uncomplete');
    mount('POST', '/api/tasks/:id/pin');
    mount('POST', '/api/tasks/:id/unpin');
    mount('GET', '/api/tasks/:id/history');
    mount(['GET', 'PATCH', 'DELETE'], '/api/tasks/:id');
  });
};
