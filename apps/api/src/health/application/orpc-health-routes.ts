import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { healthOrpcContract } from '@yoink/api-contracts/orpc';
import type { FastifyInstance } from 'fastify';
import { dispatchOrpc } from '../../shared/orpc/dispatch.js';
import { yoinkOpenApiHandlerOptions } from '../../shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../shared/orpc/http-context.js';
import type { HealthChecker } from '../domain/health-checker.js';
import { mapHealthCheckError } from './orpc-health-errors.js';

export type OrpcHealthRoutesDependencies = {
  healthChecker: HealthChecker;
};

export const registerOrpcHealthRoutes = async (
  app: FastifyInstance,
  deps: OrpcHealthRoutesDependencies
) => {
  const health = implement(healthOrpcContract).$context<OrpcHttpContext>();
  const router = health.router({
    check: health.check.handler(async () => {
      const result = await deps.healthChecker.check();
      return result.match(
        (status) => status,
        (error) => {
          throw mapHealthCheckError(error);
        }
      );
    }),
  });
  const handler = new OpenAPIHandler(router, yoinkOpenApiHandlerOptions);

  app.get('/api/health', async (request, reply) => dispatchOrpc(handler, request, reply));
};
