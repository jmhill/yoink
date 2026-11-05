import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { listOrpcContract } from '@yoink/api-contracts/orpc';
import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import {
  toNamedListListBody,
  toTaskListBody,
} from '../../listing/infrastructure/http-listed-page.js';
import { dispatchOrpc } from '../../shared/orpc/dispatch.js';
import { yoinkOpenApiHandlerOptions } from '../../shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../shared/orpc/http-context.js';
import type { ListHandlers } from '../application/create-list-handlers.js';
import {
  mapCreateNamedListError,
  mapDeleteNamedListError,
  mapListNamedListsError,
  mapListOpenTasksError,
  mapListUnlistedOpenTasksError,
  mapRenameNamedListError,
  mapReorderOpenTasksError,
  mapReorderUnlistedOpenTasksError,
} from './orpc-list-errors.js';

export type ListRoutesDependencies = {
  listHandlers: ListHandlers;
  authMiddleware: AuthMiddleware;
};

type ListHttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export const registerListRoutes = async (
  app: FastifyInstance,
  deps: ListRoutesDependencies
) => {
  const lists = implement(listOrpcContract).$context<OrpcHttpContext>();
  const router = lists.router({
    list: lists.list.handler(async ({ input, context }) => {
      const result = await deps.listHandlers.list({
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
      });

      return result.match(
        (page) => toNamedListListBody(page),
        (error) => {
          throw mapListNamedListsError(error);
        }
      );
    }),
    create: lists.create.handler(async ({ input, context }) => {
      const result = await deps.listHandlers.create({
        name: input.name,
        organizationId: context.request.authContext.organizationId,
        createdById: context.request.authContext.userId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapCreateNamedListError(error);
        }
      );
    }),
    rename: lists.rename.handler(async ({ input, context }) => {
      const result = await deps.listHandlers.rename({
        id: input.id,
        name: input.name,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapRenameNamedListError(error);
        }
      );
    }),
    listOpenTasks: lists.listOpenTasks.handler(async ({ input, context }) => {
      const result = await deps.listHandlers.listOpenTasks({
        listId: input.id,
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
      });

      return result.match(
        (page) => toTaskListBody(page),
        (error) => {
          throw mapListOpenTasksError(error);
        }
      );
    }),
    reorderOpenTasks: lists.reorderOpenTasks.handler(async ({ input, context }) => {
      const result = await deps.listHandlers.reorderOpenTasks({
        listId: input.id,
        organizationId: context.request.authContext.organizationId,
        taskIds: input.taskIds,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ tasks }) => ({ tasks }),
        (error) => {
          throw mapReorderOpenTasksError(error);
        }
      );
    }),
    listUnlistedOpenTasks: lists.listUnlistedOpenTasks.handler(async ({ input, context }) => {
      const result = await deps.listHandlers.listUnlistedOpenTasks({
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
      });

      return result.match(
        (page) => toTaskListBody(page),
        (error) => {
          throw mapListUnlistedOpenTasksError(error);
        }
      );
    }),
    reorderUnlistedOpenTasks: lists.reorderUnlistedOpenTasks.handler(
      async ({ input, context }) => {
        const result = await deps.listHandlers.reorderUnlistedOpenTasks({
          organizationId: context.request.authContext.organizationId,
          taskIds: input.taskIds,
          actor: context.request.authContext.actor,
        });

        return result.match(
          ({ tasks }) => ({ tasks }),
          (error) => {
            throw mapReorderUnlistedOpenTasksError(error);
          }
        );
      }
    ),
    delete: lists.delete.handler(async ({ input, context }) => {
      const result = await deps.listHandlers.delete({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        () => undefined,
        (error) => {
          throw mapDeleteNamedListError(error);
        }
      );
    }),
  });

  const handler = new OpenAPIHandler(router, yoinkOpenApiHandlerOptions);

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', deps.authMiddleware);

    const mount = (method: ListHttpMethod | ListHttpMethod[], url: string) => {
      authedApp.route({
        method,
        url,
        handler: async (request, reply) => dispatchOrpc(handler, request, reply),
      });
    };

    mount(['GET', 'POST'], '/api/lists');
    mount('GET', '/api/unlisted/tasks');
    mount('PUT', '/api/unlisted/tasks/order');
    mount('GET', '/api/lists/:id/tasks');
    mount('PUT', '/api/lists/:id/tasks/order');
    mount(['PATCH', 'DELETE'], '/api/lists/:id');
  });
};
