import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { projectOrpcContract } from '@yoink/api-contracts/orpc';
import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import type { HistoryHandlers } from '../../history/application/create-history-handlers.js';
import { toProjectListBody, toTaskListBody } from '../../listing/infrastructure/http-listed-page.js';
import { dispatchOrpc } from '../../shared/orpc/dispatch.js';
import { openApiHandlerOptions } from '../../shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../shared/orpc/http-context.js';
import type { ProjectHandlers } from '../application/create-project-handlers.js';
import type { SetProjectNextActionCommand } from '../domain/project-commands.js';
import {
  mapApplyImportError,
  mapChangeProjectStatusError,
  mapConfirmProposalError,
  mapCreateProjectError,
  mapDeclineProposalError,
  mapDiscardImportError,
  mapGetImportError,
  mapGetProjectError,
  mapListImportsError,
  mapListProjectHistoryError,
  mapListProjectsError,
  mapListProjectTasksError,
  mapRestoreProposalError,
  mapSetNextActionError,
  mapStageImportError,
  mapUpdateProjectError,
} from './orpc-project-errors.js';
import { projectRequestValidationError } from './project-http-errors.js';

export type ProjectRoutesDependencies = {
  projectHandlers: ProjectHandlers;
  historyHandlers: HistoryHandlers;
  authMiddleware: AuthMiddleware;
};

type RouteMethod = 'GET' | 'POST' | 'PATCH' | 'PUT';

export const registerProjectRoutes = async (
  app: FastifyInstance,
  deps: ProjectRoutesDependencies
) => {
  const { projectHandlers, historyHandlers, authMiddleware } = deps;
  const projects = implement(projectOrpcContract).$context<OrpcHttpContext>();
  const projectRouter = projects.router({
    list: projects.list.handler(async ({ input, context }) => {
      const result = await projectHandlers.list({
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
        status: input.status,
        createdById: input.createdById,
        actor: context.request.authContext.actor,
      });

      return result.match(
        (page) => toProjectListBody(page),
        (error) => {
          throw mapListProjectsError(error);
        }
      );
    }),
    create: projects.create.handler(async ({ input, context }) => {
      const result = await projectHandlers.create({
        name: input.name,
        objective: input.objective,
        status: input.status,
        reason: input.reason,
        suggestedNextAction: input.suggestedNextAction,
        organizationId: context.request.authContext.organizationId,
        createdById: context.request.authContext.userId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapCreateProjectError(error);
        }
      );
    }),
    stageImport: projects.stageImport.handler(async ({ input, context }) => {
      const result = await projectHandlers.stageImport({
        projects: input.projects,
        organizationId: context.request.authContext.organizationId,
        createdById: context.request.authContext.userId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        (view) => view,
        (error) => {
          throw mapStageImportError(error);
        }
      );
    }),
    listImports: projects.listImports.handler(async ({ context }) => {
      const result = await projectHandlers.listImports({
        organizationId: context.request.authContext.organizationId,
      });

      return result.match(
        (body) => body,
        (error) => {
          throw mapListImportsError(error);
        }
      );
    }),
    getImport: projects.getImport.handler(async ({ input, context }) => {
      const result = await projectHandlers.getImport({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        createdById: context.request.authContext.userId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        (view) => view,
        (error) => {
          throw mapGetImportError(error);
        }
      );
    }),
    applyImport: projects.applyImport.handler(async ({ input, context }) => {
      const result = await projectHandlers.applyImport({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        (view) => view,
        (error) => {
          throw mapApplyImportError(error);
        }
      );
    }),
    discardImport: projects.discardImport.handler(async ({ input, context }) => {
      const result = await projectHandlers.discardImport({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        (view) => view,
        (error) => {
          throw mapDiscardImportError(error);
        }
      );
    }),
    get: projects.get.handler(async ({ input, context }) => {
      const result = await projectHandlers.get({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
      });

      return result.match(
        (view) => view,
        (error) => {
          throw mapGetProjectError(error);
        }
      );
    }),
    listHistory: projects.listHistory.handler(async ({ input, context }) => {
      const result = await historyHandlers.listProjectHistory({
        projectId: input.id,
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
      });

      return result.match(
        (page) => page,
        (error) => {
          throw mapListProjectHistoryError(error);
        }
      );
    }),
    listOpenTasks: projects.listOpenTasks.handler(async ({ input, context }) => {
      const result =
        input.status === 'finished'
          ? await historyHandlers.listFinishedTasks({
              projectId: input.id,
              organizationId: context.request.authContext.organizationId,
              limit: input.limit,
              cursor: input.cursor,
            })
          : await projectHandlers.listOpenTasks({
              projectId: input.id,
              organizationId: context.request.authContext.organizationId,
              limit: input.limit,
              cursor: input.cursor,
            });

      return result.match(
        (page) => toTaskListBody(page),
        (error) => {
          throw mapListProjectTasksError(error);
        }
      );
    }),
    update: projects.update.handler(async ({ input, context }) => {
      const result = await projectHandlers.update({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        name: input.name,
        objective: input.objective,
        notebookPages: input.notebookPages,
        reason: input.reason,
        suggestedNextAction: input.suggestedNextAction,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapUpdateProjectError(error);
        }
      );
    }),
    changeStatus: projects.changeStatus.handler(async ({ input, context }) => {
      const result = await projectHandlers.changeStatus({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        status: input.status,
        waitingOn: input.waitingOn,
        waitingSince: input.waitingSince,
        openTasks: input.openTasks,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view, completedTaskCount, removedTaskCount }) => ({
          project: view,
          completedTaskCount,
          removedTaskCount,
        }),
        (error) => {
          throw mapChangeProjectStatusError(error);
        }
      );
    }),
    confirmProposal: projects.confirmProposal.handler(async ({ input, context }) => {
      const result = await projectHandlers.confirmProposal({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        name: input.name,
        objective: input.objective,
        status: input.status,
        waitingOn: input.waitingOn,
        waitingSince: input.waitingSince,
        suggestedNextAction: input.suggestedNextAction,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view, task }) => ({
          project: view,
          ...(task ? { task: { id: task.id, title: task.title } } : {}),
        }),
        (error) => {
          throw mapConfirmProposalError(error);
        }
      );
    }),
    declineProposal: projects.declineProposal.handler(async ({ input, context }) => {
      const result = await projectHandlers.declineProposal({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapDeclineProposalError(error);
        }
      );
    }),
    restoreProposal: projects.restoreProposal.handler(async ({ input, context }) => {
      const result = await projectHandlers.restoreProposal({
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      });

      return result.match(
        ({ view }) => view,
        (error) => {
          throw mapRestoreProposalError(error);
        }
      );
    }),
    setNextAction: projects.setNextAction.handler(async ({ input, context }) => {
      const base = {
        id: input.id,
        organizationId: context.request.authContext.organizationId,
        actor: context.request.authContext.actor,
      };
      const command: SetProjectNextActionCommand =
        'newTask' in input
          ? { type: 'newTask', ...base, newTask: input.newTask }
          : input.taskId === null
            ? { type: 'clear', ...base }
            : { type: 'set', ...base, taskId: input.taskId };
      const result = await projectHandlers.setNextAction(command);

      return result.match(
        ({ view, task }) => ({
          project: view,
          ...(task ? { task: { id: task.id, title: task.title } } : {}),
        }),
        (error) => {
          throw mapSetNextActionError(error);
        }
      );
    }),
  });

  const handler = new OpenAPIHandler(
    projectRouter,
    openApiHandlerOptions(projectRequestValidationError)
  );

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    const mount = (method: RouteMethod | readonly RouteMethod[], url: string) => {
      authedApp.route({
        method: typeof method === 'string' ? method : [...method],
        url,
        handler: async (request, reply) => dispatchOrpc(handler, request, reply),
      });
    };

    mount(['GET', 'POST'], '/api/projects');
    mount(['GET', 'POST'], '/api/projects/imports');
    mount('GET', '/api/projects/imports/:id');
    mount('POST', '/api/projects/imports/:id/apply');
    mount('POST', '/api/projects/imports/:id/discard');
    mount(['GET', 'PATCH'], '/api/projects/:id');
    mount('GET', '/api/projects/:id/tasks');
    mount('GET', '/api/projects/:id/history');
    mount('PUT', '/api/projects/:id/status');
    mount('POST', '/api/projects/:id/confirm');
    mount('POST', '/api/projects/:id/decline');
    mount('POST', '/api/projects/:id/restore');
    mount('PUT', '/api/projects/:id/next-action');
  });
};
