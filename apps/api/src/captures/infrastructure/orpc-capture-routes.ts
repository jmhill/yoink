import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import { toCaptureListBody } from '../../listing/infrastructure/http-listed-page.js';
import { dispatchOrpc } from '../../shared/orpc/dispatch.js';
import { yoinkOpenApiHandlerOptions } from '../../shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../shared/orpc/http-context.js';
import type { CaptureHandlers } from '../application/create-capture-handlers.js';
import { captureIngressContract } from './orpc-capture-contract.js';
import {
  mapAgentCaptureRefusal,
  mapCreateCaptureError,
  mapListCapturesError,
} from './orpc-capture-errors.js';

export type OrpcCaptureRoutesDependencies = {
  captureHandlers: CaptureHandlers;
  authMiddleware: AuthMiddleware;
};

export const registerOrpcCaptureRoutes = async (
  app: FastifyInstance,
  deps: OrpcCaptureRoutesDependencies
) => {
  const captures = implement(captureIngressContract).$context<OrpcHttpContext>();
  const router = captures.router({
    create: captures.create.handler(async ({ input, context }) => {
      const refusal = mapAgentCaptureRefusal(context.request.authContext.principalKind);
      if (refusal) {
        throw refusal;
      }

      const result = await deps.captureHandlers.create({
        content: input.content,
        title: input.title,
        sourceUrl: input.sourceUrl,
        sourceApp: input.sourceApp,
        organizationId: context.request.authContext.organizationId,
        createdById: context.request.authContext.userId,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapCreateCaptureError(error);
        }
      );
    }),
    list: captures.list.handler(async ({ input, context }) => {
      const result = await deps.captureHandlers.list({
        organizationId: context.request.authContext.organizationId,
        status: input.status,
        snoozed: input.snoozed,
        limit: input.limit,
        cursor: input.cursor,
      });

      return result.match(
        (page) => toCaptureListBody(page),
        (error) => {
          throw mapListCapturesError(error);
        }
      );
    }),
  });
  const handler = new OpenAPIHandler(router, yoinkOpenApiHandlerOptions);

  app.route({
    method: ['GET', 'POST'],
    url: '/api/captures',
    preHandler: deps.authMiddleware,
    handler: async (request, reply) => dispatchOrpc(handler, request, reply),
  });
};
