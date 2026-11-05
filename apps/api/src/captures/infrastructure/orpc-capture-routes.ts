import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import {
  captureOrpcContract,
  processCaptureToProjectOrpcContract,
} from '@yoink/api-contracts/orpc';
import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import { toCaptureListBody } from '../../listing/infrastructure/http-listed-page.js';
import { projectRequestValidationError } from '../../projects/infrastructure/project-http-errors.js';
import type { CaptureProcessingService } from '../../processing/application/create-processing-handlers.js';
import { dispatchOrpc } from '../../shared/orpc/dispatch.js';
import {
  openApiHandlerOptions,
  yoinkOpenApiHandlerOptions,
} from '../../shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../shared/orpc/http-context.js';
import type { CaptureHandlers } from '../application/create-capture-handlers.js';
import {
  mapAgentCaptureRefusal,
  mapCreateCaptureError,
  mapDeleteCaptureError,
  mapEmptyTrashError,
  mapFindCaptureError,
  mapListCapturesError,
  mapProcessCaptureError,
  mapProcessCaptureToProjectError,
  mapRestoreCaptureError,
  mapSnoozeCaptureError,
  mapTrashCaptureError,
  mapUnsnoozeCaptureError,
  mapUpdateCaptureError,
} from './orpc-capture-errors.js';

export type OrpcCaptureRoutesDependencies = {
  captureHandlers: CaptureHandlers;
  captureProcessingService: CaptureProcessingService;
  authMiddleware: AuthMiddleware;
};

export const registerOrpcCaptureRoutes = async (
  app: FastifyInstance,
  deps: OrpcCaptureRoutesDependencies
) => {
  const captures = implement(captureOrpcContract).$context<OrpcHttpContext>();
  const captureRouter = captures.router({
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
    get: captures.get.handler(async ({ input, context }) => {
      const result = await deps.captureHandlers.find({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
      });

      return result.match(
        (capture) => capture,
        (error) => {
          throw mapFindCaptureError(error);
        }
      );
    }),
    update: captures.update.handler(async ({ input, context }) => {
      const result = await deps.captureHandlers.update({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        title: input.title,
        content: input.content,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapUpdateCaptureError(error);
        }
      );
    }),
    trash: captures.trash.handler(async ({ input, context }) => {
      const result = await deps.captureHandlers.trash({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapTrashCaptureError(error);
        }
      );
    }),
    restore: captures.restore.handler(async ({ input, context }) => {
      const result = await deps.captureHandlers.restore({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapRestoreCaptureError(error);
        }
      );
    }),
    snooze: captures.snooze.handler(async ({ input, context }) => {
      const result = await deps.captureHandlers.snooze({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        until: input.until,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapSnoozeCaptureError(error);
        }
      );
    }),
    unsnooze: captures.unsnooze.handler(async ({ input, context }) => {
      const result = await deps.captureHandlers.unsnooze({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapUnsnoozeCaptureError(error);
        }
      );
    }),
    delete: captures.delete.handler(async ({ input, context }) => {
      const result = await deps.captureHandlers.delete({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
      });

      return result.match(
        () => undefined,
        (error) => {
          throw mapDeleteCaptureError(error);
        }
      );
    }),
    emptyTrash: captures.emptyTrash.handler(async ({ context }) => {
      const result = await deps.captureHandlers.emptyTrash({
        organizationId: context.request.authContext.organizationId,
      });

      return result.match(
        (emptied) => ({ deletedCount: emptied.deletedCount }),
        (error) => {
          throw mapEmptyTrashError(error);
        }
      );
    }),
    process: captures.process.handler(async ({ input, context }) => {
      const result = await deps.captureProcessingService.processCaptureToTask({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        createdById: context.request.authContext.userId,
        title: input.data.title,
        dueDate: input.data.dueDate,
        listId: input.data.listId,
        projectId: input.data.projectId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        (task) => task,
        (error) => {
          throw mapProcessCaptureError(error);
        }
      );
    }),
  });

  const toProject = implement(processCaptureToProjectOrpcContract).$context<OrpcHttpContext>();
  const projectRouter = toProject.router({
    processToProject: toProject.processToProject.handler(async ({ input, context }) => {
      const result = await deps.captureProcessingService.processCaptureToProject({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        createdById: context.request.authContext.userId,
        name: input.name,
        objective: input.objective,
        status: input.status,
        actor: context.request.authContext.actor,
      });

      return result.match(
        (value) => value,
        (error) => {
          throw mapProcessCaptureToProjectError(error);
        }
      );
    }),
  });

  const captureHandler = new OpenAPIHandler(captureRouter, yoinkOpenApiHandlerOptions);
  const projectHandler = new OpenAPIHandler(
    projectRouter,
    openApiHandlerOptions(projectRequestValidationError)
  );

  const mount = (
    handler: OpenAPIHandler<OrpcHttpContext>,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | Array<'GET' | 'POST' | 'PATCH' | 'DELETE'>,
    url: string
  ) => {
    app.route({
      method,
      url,
      preHandler: deps.authMiddleware,
      handler: async (request, reply) => dispatchOrpc(handler, request, reply),
    });
  };

  mount(captureHandler, ['GET', 'POST'], '/api/captures');
  mount(captureHandler, 'POST', '/api/captures/trash/empty');
  mount(captureHandler, ['GET', 'PATCH', 'DELETE'], '/api/captures/:id');
  mount(captureHandler, 'POST', '/api/captures/:id/trash');
  mount(captureHandler, 'POST', '/api/captures/:id/restore');
  mount(captureHandler, 'POST', '/api/captures/:id/snooze');
  mount(captureHandler, 'POST', '/api/captures/:id/unsnooze');
  mount(captureHandler, 'POST', '/api/captures/:id/process');
  mount(projectHandler, 'POST', '/api/captures/:id/process-to-project');
};
