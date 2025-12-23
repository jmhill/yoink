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
      status: z.enum(['inbox', 'trashed']).optional(),
      snoozed: z.coerce.boolean().optional(), // true = only snoozed, false = exclude snoozed
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
    summary: 'Update a capture (content only)',
  },

  // Workflow operations
  trash: {
    method: 'POST',
    path: '/api/captures/:id/trash',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({}),
    responses: {
      200: CaptureSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Move a capture to trash',
  },

  restore: {
    method: 'POST',
    path: '/api/captures/:id/restore',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({}),
    responses: {
      200: CaptureSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Restore a capture from trash',
  },

  // Display modifier operations
  pin: {
    method: 'POST',
    path: '/api/captures/:id/pin',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({}),
    responses: {
      200: CaptureSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Pin a capture',
  },

  unpin: {
    method: 'POST',
    path: '/api/captures/:id/unpin',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({}),
    responses: {
      200: CaptureSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Unpin a capture',
  },

  snooze: {
    method: 'POST',
    path: '/api/captures/:id/snooze',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({
      until: z.string().datetime(),
    }),
    responses: {
      200: CaptureSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Snooze a capture until a specific time',
  },

  unsnooze: {
    method: 'POST',
    path: '/api/captures/:id/unsnooze',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({}),
    responses: {
      200: CaptureSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Unsnooze a capture',
  },

  // Deletion operations
  delete: {
    method: 'DELETE',
    path: '/api/captures/:id',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: null,
    responses: {
      204: z.undefined(),
      401: ErrorSchema,
      404: ErrorSchema,
      409: ErrorSchema, // Capture must be in trash before deletion
      500: ErrorSchema,
    },
    summary: 'Permanently delete a capture (must be in trash)',
  },

  emptyTrash: {
    method: 'POST',
    path: '/api/captures/trash/empty',
    body: z.object({}),
    responses: {
      200: z.object({
        deletedCount: z.number(),
      }),
      401: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Permanently delete all captures in trash',
  },
}, {
    strictStatusCodes: true
  });
