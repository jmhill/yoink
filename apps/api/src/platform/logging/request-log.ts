import type { FastifyInstance, FastifyRequest } from 'fastify';
import { callerLogFields, callerLogInputOf } from './request-caller.js';
import { startEventLoopLagMonitor } from './event-loop-lag.js';

const responseTimeOf = (elapsedTime: number): number =>
  Number.isFinite(elapsedTime) ? elapsedTime : 0;

export const SLOW_REQUEST_MS = 1000;

type FixtureEnv = {
  YOINK_TEST_FIXTURES?: string;
  VITEST?: string;
};

export const slowRequestWarning = (env: FixtureEnv, durationMs: number): boolean =>
  env.YOINK_TEST_FIXTURES === 'true' && env.VITEST !== 'true' && durationMs >= SLOW_REQUEST_MS;

const routeOf = (request: FastifyRequest): string => request.routeOptions.url ?? request.url;

/**
 * Fastify's default completed line nests the status under `res` and omits the
 * URL. Sentry search needs url, method, and statusCode as top-level fields.
 * A successful API-token check adds tokenId. X-Yoink-Build and the user agent
 * are included when the request sent them. A public API route also adds alias.
 * Test servers record route and a slow-request warning.
 */
export const registerRequestCompletedLog = (app: FastifyInstance): void => {
  startEventLoopLagMonitor();

  app.addHook('onRequest', (request, _reply, done) => {
    request.log.info({ url: request.url, method: request.method }, 'incoming request');
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    const responseTime = responseTimeOf(reply.elapsedTime);
    const method = request.method;
    const route = routeOf(request);
    request.log.info(
      {
        ...callerLogFields(callerLogInputOf(request, reply.statusCode)),
        route,
        url: request.url,
        responseTime,
      },
      'request completed'
    );
    if (slowRequestWarning(
      {
        YOINK_TEST_FIXTURES: process.env.YOINK_TEST_FIXTURES,
        VITEST: process.env.VITEST,
      },
      responseTime
    )) {
      console.error(
        JSON.stringify({
          msg: 'slow_request',
          method,
          route,
          url: request.url,
          statusCode: reply.statusCode,
          responseTime,
          reqId: request.id,
          time: Date.now(),
        })
      );
    }
    done();
  });
};
