import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  ChangeProjectStatusResponseSchema,
  ChangeProjectStatusSchema,
  CreateProjectSchema,
  ProjectSchema,
  SetProjectNextActionResponseSchema,
  SetProjectNextActionSchema,
  UpdateProjectSchema,
} from '../schemas/project.js';
import {
  HistoryPageSchema,
  ProjectTasksStatusSchema,
} from '../schemas/history.js';
import { ListPageQuerySchema, ProjectListPageSchema, TaskListPageSchema } from '../schemas/list-page.js';
import { ErrorSchema, ProjectHasOpenTasksErrorSchema } from '../schemas/error.js';

const c = initContract();

export const projectContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/projects',
      query: ListPageQuerySchema,
      responses: {
        200: ProjectListPageSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
      summary: "View this organization's projects",
    },

    create: {
      method: 'POST',
      path: '/api/projects',
      body: CreateProjectSchema,
      responses: {
        201: ProjectSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        403: ErrorSchema,
        409: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Create a project in this organization (person only)',
    },

    get: {
      method: 'GET',
      path: '/api/projects/:id',
      pathParams: z.object({
        id: z.string().uuid(),
      }),
      responses: {
        200: ProjectSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Read one project in this organization',
    },

    update: {
      method: 'PATCH',
      path: '/api/projects/:id',
      pathParams: z.object({
        id: z.string().uuid(),
      }),
      body: UpdateProjectSchema,
      responses: {
        200: ProjectSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        409: ErrorSchema,
        500: ErrorSchema,
      },
      summary: "Edit a project's name or objective",
    },

    listOpenTasks: {
      method: 'GET',
      path: '/api/projects/:id/tasks',
      pathParams: z.object({
        id: z.string().uuid(),
      }),
      query: ListPageQuerySchema.extend({
        status: ProjectTasksStatusSchema,
      }),
      responses: {
        200: TaskListPageSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary:
        "List a project's open tasks (default) or finished tasks (?status=finished), newest first",
    },

    listHistory: {
      method: 'GET',
      path: '/api/projects/:id/history',
      pathParams: z.object({
        id: z.string().uuid(),
      }),
      query: ListPageQuerySchema,
      responses: {
        200: HistoryPageSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary: "Read a project's visible change-log timeline, newest first",
    },

    changeStatus: {
      method: 'PUT',
      path: '/api/projects/:id/status',
      pathParams: z.object({
        id: z.string().uuid(),
      }),
      body: ChangeProjectStatusSchema,
      responses: {
        200: ChangeProjectStatusResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        403: ErrorSchema,
        404: ErrorSchema,
        409: ProjectHasOpenTasksErrorSchema,
        500: ErrorSchema,
      },
      summary: "Change a project's status, including waiting on / since",
    },

    setNextAction: {
      method: 'PUT',
      path: '/api/projects/:id/next-action',
      pathParams: z.object({
        id: z.string().uuid(),
      }),
      body: SetProjectNextActionSchema,
      responses: {
        200: SetProjectNextActionResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
      summary:
        "Set, replace, or clear a project's next action, or create a task and set it",
    },
  },
  {
    strictStatusCodes: true,
  }
);
