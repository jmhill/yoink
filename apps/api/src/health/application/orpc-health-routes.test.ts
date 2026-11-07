import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errAsync, okAsync } from 'neverthrow';
import { healthCheckError } from '../../platform/health/health-errors.js';
import type { HealthChecker, HealthStatus } from '../../platform/health/health-checker.js';
import { registerOrpcHealthRoutes } from '../../edges/ops/orpc-health-routes.js';
import { createTestApp } from '../../tests/helpers/test-app.js';

const healthy: HealthStatus = { status: 'healthy', database: 'connected' };

const checker = (check: HealthChecker['check']): HealthChecker => ({ check });

const loggedApp = (): { app: FastifyInstance; lines: string[] } => {
  const lines: string[] = [];
  const app = Fastify({
    logger: {
      level: 'info',
      stream: {
        write: (message: string) => {
          lines.push(message);
        },
      },
    },
  });
  return { app, lines };
};

describe('GET /api/health via oRPC', () => {
  it('reports the healthy body on the production path', async () => {
    const app = await createTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'healthy', database: 'connected' });
    expect(response.headers['content-type']).toContain('application/json');
  });

  it('returns the unhealthy body and logs the original check error', async () => {
    const cause = new Error('sqlite closed');
    const { app, lines } = loggedApp();
    await registerOrpcHealthRoutes(app, {
      healthChecker: checker(() =>
        errAsync(healthCheckError('Database health check failed', cause))
      ),
    });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unhealthy', database: 'disconnected' });
    expect(response.json()).not.toHaveProperty('defined');
    expect(lines.join('\n')).toContain('Health check failed');
    expect(lines.join('\n')).toContain('Database health check failed');
    await app.close();
  });

  it('returns the checker value when the database is up', async () => {
    const { app } = loggedApp();
    await registerOrpcHealthRoutes(app, {
      healthChecker: checker(() => okAsync(healthy)),
    });

    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(healthy);
    await app.close();
  });
});
