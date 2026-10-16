import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthMiddleware } from './auth-middleware.js';

export type AuthenticatedRateLimitConsume = (userId: string) => {
  limited: boolean;
  retryAfterSeconds: number;
};

/**
 * Run the user limiter only after auth has already resolved a principal.
 * The cheap IP limiter has already run on onRequest — this never looks up
 * a session or token.
 */
export const withAuthenticatedRateLimit = (
  auth: AuthMiddleware,
  consume: AuthenticatedRateLimitConsume
): AuthMiddleware => {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await auth(request, reply);
    if (reply.sent) {
      return;
    }
    const result = consume(request.authContext.userId);
    if (!result.limited) {
      return;
    }
    return reply
      .status(429)
      .header('retry-after', String(result.retryAfterSeconds))
      .send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded, retry in 1 minute',
      });
  };
};
