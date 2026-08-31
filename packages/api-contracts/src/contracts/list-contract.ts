import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CreateNamedListSchema, NamedListSchema } from '../schemas/list.js';
import { ErrorSchema } from '../schemas/error.js';

const c = initContract();

export const listContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/lists',
      responses: {
        200: z.object({
          lists: z.array(NamedListSchema),
        }),
        401: ErrorSchema,
        500: ErrorSchema,
      },
      summary: "View this organization's named lists",
    },

    create: {
      method: 'POST',
      path: '/api/lists',
      body: CreateNamedListSchema,
      responses: {
        201: NamedListSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
      summary: 'Create a named list in this organization',
    },
  },
  {
    strictStatusCodes: true,
  }
);
