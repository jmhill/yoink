import { oc } from '@orpc/contract';
import { openapi } from '@orpc/openapi';
import { HealthResponseSchema } from '@yoink/api-contracts';

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
