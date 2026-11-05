import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { HealthResponseSchema } from '../schemas/health.js';

export const healthOrpcContract = oc.router({
  check: oc
    .meta(
      openapi({
        method: 'GET',
        path: '/api/health',
        successStatus: 200,
        summary: 'Health check endpoint',
      })
    )
    .output(HealthResponseSchema),
});
