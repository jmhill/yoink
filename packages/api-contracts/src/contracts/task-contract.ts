import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { TaskSchema, CreateTaskSchema, UpdateTaskSchema, TaskFilterSchema } from '../schemas/task.js';
import { ErrorSchema } from '../schemas/error.js';

const c = initContract();

export const taskContract = c.router({
  create: {
    method: 'POST',
    path: '/api/tasks',
    body: CreateTaskSchema,
    responses: {
      201: TaskSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Create a new task',
  },

  list: {
    method: 'GET',
    path: '/api/tasks',
    query: z.object({
      filter: TaskFilterSchema.optional(), // today, upcoming, all, completed
      limit: z.coerce.number().min(1).max(100).default(50),
      cursor: z.string().uuid().optional(),
    }),
    responses: {
      200: z.object({
        tasks: z.array(TaskSchema),
        nextCursor: z.string().uuid().optional(),
      }),
      401: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'List tasks',
  },

  get: {
    method: 'GET',
    path: '/api/tasks/:id',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    responses: {
      200: TaskSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Get a task by ID',
  },

  update: {
    method: 'PATCH',
    path: '/api/tasks/:id',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: UpdateTaskSchema,
    responses: {
      200: TaskSchema,
      400: ErrorSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Update a task (title, dueDate)',
  },

  // Completion operations
  complete: {
    method: 'POST',
    path: '/api/tasks/:id/complete',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({}),
    responses: {
      200: TaskSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Mark a task as complete',
  },

  uncomplete: {
    method: 'POST',
    path: '/api/tasks/:id/uncomplete',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({}),
    responses: {
      200: TaskSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Mark a task as incomplete',
  },

  // Pin operations
  pin: {
    method: 'POST',
    path: '/api/tasks/:id/pin',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({}),
    responses: {
      200: TaskSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Pin a task to top of list',
  },

  unpin: {
    method: 'POST',
    path: '/api/tasks/:id/unpin',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: z.object({}),
    responses: {
      200: TaskSchema,
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Unpin a task',
  },

  // Deletion
  delete: {
    method: 'DELETE',
    path: '/api/tasks/:id',
    pathParams: z.object({
      id: z.string().uuid(),
    }),
    body: null,
    responses: {
      204: z.undefined(),
      401: ErrorSchema,
      404: ErrorSchema,
      500: ErrorSchema,
    },
    summary: 'Delete a task (also deletes source capture if any)',
  },
}, {
  strictStatusCodes: true,
});
