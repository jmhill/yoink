import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CaptureSchema, CreateCaptureSchema } from '../schemas/capture.js';
import { ErrorSchema } from '../schemas/error.js';

const c = initContract();

export const captureContract = c.router({
  create: {
    method: 'POST',
    path: '/captures',
    body: CreateCaptureSchema,
    responses: {
      201: CaptureSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Create a new capture',
  },

  list: {
    method: 'GET',
    path: '/captures',
    query: z.object({
      status: z.enum(['inbox', 'archived']).optional(),
      limit: z.coerce.number().min(1).max(100).default(50),
      cursor: z.string().uuid().optional(),
    }),
    responses: {
      200: z.object({
        captures: z.array(CaptureSchema),
        nextCursor: z.string().uuid().optional(),
      }),
      401: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'List captures',
  },
});
