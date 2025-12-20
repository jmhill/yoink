import { initContract } from '@ts-rest/core';
import { HealthResponseSchema } from '../schemas/health.js';

const c = initContract();

export const healthContract = c.router({
  check: {
    method: 'GET',
    path: '/api/health',
    responses: {
      200: HealthResponseSchema,
      503: HealthResponseSchema,
    },
    summary: 'Health check endpoint',
  },
}, {
  strictStatusCodes: true,
});
