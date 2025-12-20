import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CaptureSchema, CreateCaptureSchema, UpdateCaptureSchema } from '../schemas/capture.js';
import { ErrorSchema } from '../schemas/error.js';

const c = initContract();

export const captureContract = c.router({
  create: {
    method: 'POST',
    path: '/api/captures',
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
    path: '/api/captures',
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

  get: {
    method: 'GET',
    path: '/api/captures/:id',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    responses: {
      200: CaptureSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Get a capture by ID',
  },

  update: {
    method: 'PATCH',
    path: '/api/captures/:id',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: UpdateCaptureSchema,
    responses: {
      200: CaptureSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Update a capture',
  },
}, {
    strictStatusCodes: true
  });
