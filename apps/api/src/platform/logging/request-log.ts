import type { FastifyInstance } from 'fastify';

const responseTimeOf = (elapsedTime: number): number =>
  Number.isFinite(elapsedTime) ? elapsedTime : 0;

/**
 * Fastify's default completed line nests the status under `res` and omits the
 * URL. Sentry search needs both as top-level fields on `request completed`.
 */
export const registerRequestCompletedLog = (app: FastifyInstance): void => {
  app.addHook('onRequest', (request, _reply, done) => {
    request.log.info({ url: request.url, method: request.method }, 'incoming request');
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      {
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: responseTimeOf(reply.elapsedTime),
      },
      'request completed'
    );
    done();
  });
};
