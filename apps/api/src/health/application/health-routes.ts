import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { healthContract } from '@yoink/api-contracts';
import type { HealthChecker } from '../domain/health-checker.js';

export type HealthRoutesDependencies = {
  healthChecker: HealthChecker;
};

export const registerHealthRoutes = async (
  app: FastifyInstance,
  deps: HealthRoutesDependencies
) => {
  const { healthChecker } = deps;
  const s = initServer();

  const healthRouter = s.router(healthContract, {
    check: async () => {
      const result = await healthChecker.check();
      return result.match(
        (health) => ({
          status: 200 as const,
          body: health,
        }),
        () => ({
          status: 503 as const,
          body: { status: 'unhealthy', database: 'disconnected' } as const,
        })
      );
    },
  });

  s.registerRouter(healthContract, healthRouter, app, {
    responseValidation: true,
  });
};
