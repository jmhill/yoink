import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
  AuthenticateSession,
  RecordSessionActivity,
  UserSession,
} from '../../../access/index.js';
import type { AuthContext } from '../../../kernel/auth-context.js';

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
  authenticateSession: AuthenticateSession;
  recordSessionActivity: RecordSessionActivity;
};

export const createUserSessionMiddleware = (
  deps: UserSessionMiddlewareDependencies
): UserSessionMiddleware => {
  const { authenticateSession, recordSessionActivity } = deps;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const sessionId = (request.cookies as Record<string, string>)?.[USER_SESSION_COOKIE];

    if (!sessionId) {
      return reply.status(401).send({ message: 'Not authenticated' });
    }

    const result = await authenticateSession(sessionId);

    if (result.isErr()) {
      // Storage error - log and return generic error
      request.log.error({ error: result.error }, 'Session validation failed');
      return reply.status(500).send({ message: 'Internal server error' });
    }

    const authenticated = result.value;
    if (!authenticated) {
      return reply.status(401).send({ message: 'Invalid or expired session' });
    }

    // Set auth context for downstream handlers
    request.authContext = {
      organizationId: authenticated.organizationId,
      userId: authenticated.userId,
      principalKind: authenticated.principalKind,
      actor: authenticated.actor,
    };

    // Also expose the full session for handlers that need it
    request.userSession = authenticated.session;

    // Bind auth context to request logger for all subsequent logs
    request.log = request.log.child({
      userId: request.authContext.userId,
      orgId: request.authContext.organizationId,
    });

    // Optionally refresh session if it's been idle
    // Note: We don't await this to avoid slowing down the request
    // Using Promise.resolve() to get a proper Promise with .catch() support
    Promise.resolve(recordSessionActivity(sessionId))
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
