import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { NamedListSchema } from '../schemas/list.js';
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
  },
  {
    strictStatusCodes: true,
  }
);
