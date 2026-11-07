import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { workOrpcContract } from '@yoink/api-contracts/orpc';
import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import {
  toTaskListBody,
  toWorkListsBody,
  toWorkNextActionsBody,
} from '../../edges/_shared/http-listed-page.js';
import { listedRequestValidationError } from '../../edges/_shared/request-validation.js';
import { dispatchOrpc } from '../../edges/_shared/orpc/dispatch.js';
import { openApiHandlerOptions } from '../../edges/_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../edges/_shared/orpc/http-context.js';
import type { WorkHandlers } from '../application/create-work-handlers.js';
import {
  mapListDueError,
  mapListNextActionsError,
  mapListWorkListsError,
} from './orpc-work-errors.js';

export type WorkRoutesDependencies = {
  workHandlers: WorkHandlers;
  authMiddleware: AuthMiddleware;
};

export const registerWorkRoutes = async (
  app: FastifyInstance,
  deps: WorkRoutesDependencies
) => {
  const work = implement(workOrpcContract).$context<OrpcHttpContext>();
  const router = work.router({
    listNextActions: work.listNextActions.handler(async ({ input, context }) => {
      const result = await deps.workHandlers.listNextActions({
        organizationId: context.request.authContext.organizationId,
        callerId: context.request.authContext.userId,
        owner: input.owner,
        limit: input.limit,
        cursor: input.cursor,
      });

      return result.match(
        (page) => toWorkNextActionsBody(page),
        (error) => {
          throw mapListNextActionsError(error);
        }
      );
    }),
    listDue: work.listDue.handler(async ({ input, context }) => {
      const result = await deps.workHandlers.listDue({
        organizationId: context.request.authContext.organizationId,
        callerId: context.request.authContext.userId,
        owner: input.owner,
        limit: input.limit,
        cursor: input.cursor,
        timeZone: input.timeZone,
      });

      return result.match(
        (page) => toTaskListBody(page),
        (error) => {
          throw mapListDueError(error);
        }
      );
    }),
    listLists: work.listLists.handler(async ({ input, context }) => {
      const result = await deps.workHandlers.listLists({
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
      });

      return result.match(
        (page) => toWorkListsBody(page),
        (error) => {
          throw mapListWorkListsError(error);
        }
      );
    }),
  });

  const handler = new OpenAPIHandler(router, openApiHandlerOptions(listedRequestValidationError));

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', deps.authMiddleware);

    const mount = (url: string) => {
      authedApp.route({
        method: 'GET',
        url,
        handler: async (request, reply) => dispatchOrpc(handler, request, reply),
      });
    };

    mount('/api/work/next-actions');
    mount('/api/work/due');
    mount('/api/work/lists');
  });
};
