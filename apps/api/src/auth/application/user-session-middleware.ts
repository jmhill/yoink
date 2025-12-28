import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthContext } from '../../shared/auth-context.js';
import type { UserSession } from '../domain/user-session.js';
import type { SessionService } from '../domain/session-service.js';

declare module 'fastify' {
  interface FastifyRequest {
    authContext: AuthContext;
    userSession?: UserSession;
  }
}

export const USER_SESSION_COOKIE = 'user_session';

export type UserSessionMiddleware = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

export type UserSessionMiddlewareDependencies = {
  sessionService: SessionService;
};

export const createUserSessionMiddleware = (
  deps: UserSessionMiddlewareDependencies
): UserSessionMiddleware => {
  const { sessionService } = deps;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const sessionId = (request.cookies as Record<string, string>)?.[USER_SESSION_COOKIE];

    if (!sessionId) {
      return reply.status(401).send({ message: 'Not authenticated' });
    }

    const result = await sessionService.validateSession(sessionId);

    if (result.isErr()) {
      // Storage error - log and return generic error
      request.log.error({ error: result.error }, 'Session validation failed');
      return reply.status(500).send({ message: 'Internal server error' });
    }

    const session = result.value;
    if (!session) {
      return reply.status(401).send({ message: 'Invalid or expired session' });
    }

    // Set auth context for downstream handlers
    request.authContext = {
      organizationId: session.currentOrganizationId,
      userId: session.userId,
    };

    // Also expose the full session for handlers that need it
    request.userSession = session;

    // Bind auth context to request logger for all subsequent logs
    request.log = request.log.child({
      userId: request.authContext.userId,
      orgId: request.authContext.organizationId,
    });

    // Optionally refresh session if it's been idle
    // Note: We don't await this to avoid slowing down the request
    // Using Promise.resolve() to get a proper Promise with .catch() support
    Promise.resolve(sessionService.refreshSession(sessionId))
      .then((refreshResult) => {
        if (refreshResult.isErr()) {
          request.log.warn({ error: refreshResult.error }, 'Session refresh failed');
        }
      })
      .catch((err: unknown) => {
        request.log.error({ error: err }, 'Unexpected session refresh error');
      });
  };
};
