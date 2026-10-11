import { initContract } from '@ts-rest/core';
import { ListPageQuerySchema, TaskListPageSchema } from '../schemas/list-page.js';
import { ErrorSchema } from '../schemas/error.js';
import {
  WorkDueQuerySchema,
  WorkListsPageSchema,
  WorkNextActionsPageSchema,
  WorkNextActionsQuerySchema,
} from '../schemas/work.js';

const c = initContract();

export const workContract = c.router(
  {
    listNextActions: {
      method: 'GET',
      path: '/api/work/next-actions',
      query: WorkNextActionsQuerySchema,
      responses: {
        200: WorkNextActionsPageSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
      summary:
        "List each active project's open next action. owner=me keeps only the caller's assigned tasks.",
    },

    listDue: {
      method: 'GET',
      path: '/api/work/due',
      query: WorkDueQuerySchema,
      responses: {
        200: TaskListPageSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
      summary:
        'List open tasks due on or before the viewer today that are not already shown as a next action.',
    },

    listLists: {
      method: 'GET',
      path: '/api/work/lists',
      query: ListPageQuerySchema,
      responses: {
        200: WorkListsPageSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
      summary:
        'Named lists in GET /api/lists order with open-task counts, plus the Unlisted open count.',
    },
  },
  {
    strictStatusCodes: true,
  }
);
