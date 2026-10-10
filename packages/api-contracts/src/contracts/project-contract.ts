import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  CreateProjectSchema,
  ProjectSchema,
  UpdateProjectSchema,
} from '../schemas/project.js';
import { ListPageQuerySchema, ProjectListPageSchema } from '../schemas/list-page.js';
import { ErrorSchema } from '../schemas/error.js';

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
  },
  {
    strictStatusCodes: true,
  }
);
