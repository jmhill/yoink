import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthContext } from '../../shared/auth-context.js';
import type { UserSession } from '../domain/user-session.js';
import type { TokenService } from '../domain/token-service.js';
import type { SessionService } from '../domain/session-service.js';

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
  tokenService: TokenService;
  sessionService: SessionService;
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
  const { tokenService, sessionService, sessionCookieName } = deps;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const sessionId = (request.cookies as Record<string, string>)?.[sessionCookieName];
    const authHeader = request.headers.authorization;

    // Try session cookie first (preferred auth method)
    if (sessionId) {
      const sessionResult = await sessionService.validateSession(sessionId);

      if (sessionResult.isOk()) {
        const session = sessionResult.value;
        if (session) {
          // Valid session - use it
          request.authContext = {
            organizationId: session.currentOrganizationId,
            userId: session.userId,
          };
          request.userSession = session;

          // Bind auth context to request logger
          request.log = request.log.child({
            userId: request.authContext.userId,
            orgId: request.authContext.organizationId,
          });

          // Refresh session in background if idle
          Promise.resolve(sessionService.refreshSession(sessionId))
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
      const tokenResult = await tokenService.validateToken({ plaintext: token });

      if (tokenResult.isOk()) {
        request.authContext = {
          organizationId: tokenResult.value.organization.id,
          userId: tokenResult.value.user.id,
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
