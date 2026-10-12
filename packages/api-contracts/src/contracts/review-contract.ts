import { initContract } from '@ts-rest/core';
import { ErrorSchema } from '../schemas/error.js';
import {
  DoneListPageSchema,
  DoneListQuerySchema,
  ReviewPageSchema,
  ReviewQuerySchema,
} from '../schemas/review.js';

const c = initContract();

export const reviewContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/review',
      query: ReviewQuerySchema,
      responses: {
        200: ReviewPageSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
      summary:
        'Projects that need attention: active with no next action, active with no change in 7 days, and every waiting project.',
    },
    done: {
      method: 'GET',
      path: '/api/review/done',
      query: DoneListQuerySchema,
      responses: {
        200: DoneListPageSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
      summary:
        'Tasks finished in a Monday–Sunday week in the stored org time zone, grouped by project.',
    },
  },
  {
    strictStatusCodes: true,
  }
);
