import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { projectContract } from '@yoink/api-contracts';
import type { AuthMiddleware } from '../../access/application/index.js';
import type { ProjectHandlers } from '../application/create-project-handlers.js';
import type { HistoryHandlers } from '../../history/application/create-history-handlers.js';
import {
  invalidCursorHttp,
  toProjectListBody,
  toTaskListBody,
} from '../../listing/infrastructure/http-listed-page.js';
import { projectRequestValidationError } from './project-http-errors.js';

export type ProjectRoutesDependencies = {
  projectHandlers: ProjectHandlers;
  historyHandlers: HistoryHandlers;
  authMiddleware: AuthMiddleware;
};

const projectErrorBody = (error: { type: string; message: string }) => ({
  message: error.message,
  code: error.type,
});

const importInvalidHttp = (error: {
  message: string;
  errors: readonly { index: number; name: string; field: string; code: string; message: string }[];
}) => ({
  status: 400 as const,
  body: {
    message: error.message,
    code: 'IMPORT_INVALID' as const,
    errors: [...error.errors],
  },
});

export const registerProjectRoutes = async (
  app: FastifyInstance,
  deps: ProjectRoutesDependencies
) => {
  const { projectHandlers, historyHandlers, authMiddleware } = deps;
  const s = initServer();

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    const projectRouter = s.router(projectContract, {
      list: async ({ query, request }) => {
        const result = await projectHandlers.list({
          organizationId: request.authContext.organizationId,
          limit: query.limit,
          cursor: query.cursor,
        });

        return result.match(
          (page) => ({
            status: 200 as const,
            body: toProjectListBody(page),
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

      create: async ({ body, request }) => {
        const result = await projectHandlers.create({
          name: body.name,
          objective: body.objective,
          organizationId: request.authContext.organizationId,
          createdById: request.authContext.userId,
          actor: request.authContext.actor,
        });

        return result.match(
          ({ view }) => ({
            status: 201 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'PROJECT_NAME_BLANK':
              case 'INVALID_PROJECT_NAME':
                return {
                  status: 400 as const,
                  body: projectErrorBody(error),
                };
              case 'DUPLICATE_PROJECT_NAME':
                return {
                  status: 409 as const,
                  body: projectErrorBody(error),
                };
              case 'PROJECT_CREATE_REQUIRES_PERSON':
                return {
                  status: 403 as const,
                  body: projectErrorBody(error),
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

      stageImport: async ({ body, request }) => {
        const result = await projectHandlers.stageImport({
          projects: body.projects,
          organizationId: request.authContext.organizationId,
          createdById: request.authContext.userId,
          actor: request.authContext.actor,
        });

        return result.match(
          (view) => ({
            status: 201 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'IMPORT_INVALID':
                return importInvalidHttp(error);
              case 'STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      listImports: async ({ request }) => {
        const result = await projectHandlers.listImports({
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          (body) => ({
            status: 200 as const,
            body,
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

      getImport: async ({ params, request }) => {
        const result = await projectHandlers.getImport({
          id: params.id,
          organizationId: request.authContext.organizationId,
          createdById: request.authContext.userId,
          actor: request.authContext.actor,
        });

        return result.match(
          (view) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'IMPORT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: projectErrorBody(error),
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

      applyImport: async ({ params, request }) => {
        const result = await projectHandlers.applyImport({
          id: params.id,
          organizationId: request.authContext.organizationId,
          actor: request.authContext.actor,
        });

        return result.match(
          (view) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'IMPORT_INVALID':
                return importInvalidHttp(error);
              case 'IMPORT_REQUIRES_PERSON':
                return {
                  status: 403 as const,
                  body: projectErrorBody(error),
                };
              case 'IMPORT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: projectErrorBody(error),
                };
              case 'IMPORT_NOT_PENDING':
                return {
                  status: 409 as const,
                  body: projectErrorBody(error),
                };
              case 'DUPLICATE_PROJECT_NAME':
                return {
                  status: 409 as const,
                  body: projectErrorBody(error),
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

      discardImport: async ({ params, request }) => {
        const result = await projectHandlers.discardImport({
          id: params.id,
          organizationId: request.authContext.organizationId,
          actor: request.authContext.actor,
        });

        return result.match(
          (view) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'IMPORT_REQUIRES_PERSON':
                return {
                  status: 403 as const,
                  body: projectErrorBody(error),
                };
              case 'IMPORT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: projectErrorBody(error),
                };
              case 'IMPORT_NOT_PENDING':
                return {
                  status: 409 as const,
                  body: projectErrorBody(error),
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

      get: async ({ params, request }) => {
        const result = await projectHandlers.get({
          id: params.id,
          organizationId: request.authContext.organizationId,
        });

        return result.match(
          (view) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'PROJECT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: projectErrorBody(error),
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

      listHistory: async ({ params, query, request }) => {
        const result = await historyHandlers.listProjectHistory({
          projectId: params.id,
          organizationId: request.authContext.organizationId,
          limit: query.limit,
          cursor: query.cursor,
        });

        return result.match(
          (page) => ({
            status: 200 as const,
            body: page,
          }),
          (error) => {
            switch (error.type) {
              case 'INVALID_CURSOR':
                return invalidCursorHttp(error);
              case 'PROJECT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: projectErrorBody(error),
                };
              case 'STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error', code: 'STORAGE_ERROR' },
                };
            }
          }
        );
      },

      listOpenTasks: async ({ params, query, request }) => {
        const result =
          query.status === 'finished'
            ? await historyHandlers.listFinishedTasks({
                projectId: params.id,
                organizationId: request.authContext.organizationId,
                limit: query.limit,
                cursor: query.cursor,
              })
            : await projectHandlers.listOpenTasks({
                projectId: params.id,
                organizationId: request.authContext.organizationId,
                limit: query.limit,
                cursor: query.cursor,
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
              case 'PROJECT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: projectErrorBody(error),
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
        const result = await projectHandlers.update({
          id: params.id,
          organizationId: request.authContext.organizationId,
          name: body.name,
          objective: body.objective,
          notebookPages: body.notebookPages,
          actor: request.authContext.actor,
        });

        return result.match(
          ({ view }) => ({
            status: 200 as const,
            body: view,
          }),
          (error) => {
            switch (error.type) {
              case 'PROJECT_NAME_BLANK':
              case 'INVALID_PROJECT_NAME':
              case 'INVALID_NOTEBOOK_PATH':
              case 'NOTEBOOK_PAGE_DUPLICATE':
              case 'NOTEBOOK_PAGES_TOO_MANY':
                return {
                  status: 400 as const,
                  body: projectErrorBody(error),
                };
              case 'DUPLICATE_PROJECT_NAME':
                return {
                  status: 409 as const,
                  body: projectErrorBody(error),
                };
              case 'PROJECT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: projectErrorBody(error),
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

      changeStatus: async ({ params, body, request }) => {
        const result = await projectHandlers.changeStatus({
          id: params.id,
          organizationId: request.authContext.organizationId,
          status: body.status,
          waitingOn: body.waitingOn,
          waitingSince: body.waitingSince,
          openTasks: body.openTasks,
          actor: request.authContext.actor,
        });

        return result.match(
          ({ view, completedTaskCount, removedTaskCount }) => ({
            status: 200 as const,
            body: {
              project: view,
              completedTaskCount,
              removedTaskCount,
            },
          }),
          (error) => {
            switch (error.type) {
              case 'INVALID_PROJECT_STATUS':
              case 'PROJECT_WAITING_ON_REQUIRED':
              case 'PROJECT_WAITING_ON_BLANK':
              case 'PROJECT_WAITING_ON_TOO_LONG':
              case 'INVALID_WAITING_SINCE':
                return {
                  status: 400 as const,
                  body: projectErrorBody(error),
                };
              case 'PROJECT_DONE_REQUIRES_PERSON':
              case 'PROJECT_REOPEN_REQUIRES_PERSON':
                return {
                  status: 403 as const,
                  body: projectErrorBody(error),
                };
              case 'PROJECT_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: projectErrorBody(error),
                };
              case 'PROJECT_HAS_OPEN_TASKS':
              case 'OPEN_TASKS_UNREAD':
                return {
                  status: 409 as const,
                  body: {
                    ...projectErrorBody(error),
                    openTaskCount: error.openTaskCount,
                  },
                };
              case 'STORAGE_ERROR':
              case 'OPEN_TASK_PLAN_FAILED':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },

      setNextAction: async ({ params, body, request }) => {
        const base = {
          id: params.id,
          organizationId: request.authContext.organizationId,
          actor: request.authContext.actor,
        };
        const command =
          'newTask' in body
            ? { type: 'newTask' as const, ...base, newTask: body.newTask }
            : body.taskId === null
              ? { type: 'clear' as const, ...base }
              : { type: 'set' as const, ...base, taskId: body.taskId };
        const result = await projectHandlers.setNextAction(command);

        return result.match(
          ({ view, task }) => ({
            status: 200 as const,
            body: {
              project: view,
              ...(task ? { task: { id: task.id, title: task.title } } : {}),
            },
          }),
          (error) => {
            switch (error.type) {
              case 'TASK_NOT_OPEN':
              case 'TASK_NOT_IN_PROJECT':
              case 'PROJECT_DONE':
              case 'TASK_TITLE_BLANK':
              case 'TASK_TITLE_TOO_LONG':
              case 'LIST_NOT_IN_ORGANIZATION':
              case 'ASSIGNEE_NOT_IN_ORGANIZATION':
                return {
                  status: 400 as const,
                  body: projectErrorBody(error),
                };
              case 'PROJECT_NOT_FOUND':
              case 'TASK_NOT_FOUND':
                return {
                  status: 404 as const,
                  body: projectErrorBody(error),
                };
              case 'STORAGE_ERROR':
              case 'OPEN_TASK_PLAN_FAILED':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },
    });

    s.registerRouter(projectContract, projectRouter, authedApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send(projectRequestValidationError(err));
      },
    });
  });
};
