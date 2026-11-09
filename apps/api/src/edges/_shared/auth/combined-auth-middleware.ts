import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
  AuthenticateSession,
  AuthenticateToken,
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

export type CombinedAuthMiddleware = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

export type CombinedAuthMiddlewareDependencies = {
  authenticateToken: AuthenticateToken;
  authenticateSession: AuthenticateSession;
  recordSessionActivity: RecordSessionActivity;
  sessionCookieName: string;
};

/**
 * Combined auth middleware that accepts either:
 * 1. Session cookie (preferred) - for web app users with passkeys
 * 2. Bearer token - for API clients (extension, CLI) and legacy web auth
 *
 * Session cookie takes precedence when both are present.
 * Falls back to token auth if session is invalid.
 */
export const createCombinedAuthMiddleware = (
  deps: CombinedAuthMiddlewareDependencies
): CombinedAuthMiddleware => {
  const { authenticateToken, authenticateSession, recordSessionActivity, sessionCookieName } =
    deps;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const sessionId = (request.cookies as Record<string, string>)?.[sessionCookieName];
    const authHeader = request.headers.authorization;

    // Try session cookie first (preferred auth method)
    if (sessionId) {
      const sessionResult = await authenticateSession(sessionId);

      if (sessionResult.isOk()) {
        const authenticated = sessionResult.value;
        if (authenticated) {
          // Valid session - use it
          request.authContext = {
            organizationId: authenticated.organizationId,
            userId: authenticated.userId,
            // Sessions are passkey-issued; agents cannot passkey.
            principalKind: authenticated.principalKind,
            actor: authenticated.actor,
          };
          request.userSession = authenticated.session;

          // Bind auth context to request logger
          request.log = request.log.child({
            userId: request.authContext.userId,
            orgId: request.authContext.organizationId,
          });

          // Refresh session in background if idle
          Promise.resolve(recordSessionActivity(sessionId))
            .then((refreshResult) => {
              if (refreshResult.isErr()) {
                request.log.warn({ error: refreshResult.error }, 'Session refresh failed');
              }
            })
            .catch((err: unknown) => {
              request.log.error({ error: err }, 'Unexpected session refresh error');
            });

          return;
        }
      }
      // Session invalid or error - fall through to try token auth
    }

    // Try Bearer token as fallback
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const tokenResult = await authenticateToken(token);

      if (tokenResult.isOk()) {
        request.authContext = {
          organizationId: tokenResult.value.organizationId,
          userId: tokenResult.value.userId,
          principalKind: tokenResult.value.principalKind,
          actor: tokenResult.value.actor,
        };

        // Bind auth context to request logger
        request.log = request.log.child({
          userId: request.authContext.userId,
          orgId: request.authContext.organizationId,
        });

        return;
      }

      // Token was provided but invalid - return 401 with token error message
      return reply.status(401).send({ message: 'Invalid token' });
    }

    // If session cookie was provided but invalid (and no token), give session-specific error
    if (sessionId) {
      return reply.status(401).send({ message: 'Invalid or expired session' });
    }

    // Neither valid session nor token provided
    return reply.status(401).send({ message: 'Not authenticated' });
  };
};
