import type { TokenService } from '../domain/token-service.js';
import type { SessionService } from '../domain/session-service.js';
import { bearerPlaintext, sessionIdFromCookieHeader } from '../../shared/rate-limit-policy.js';

export type RateLimitPrincipalQuery = {
  cookieHeader?: string;
  authorization?: string;
  sessionCookieName: string;
};

export type ResolveRateLimitPrincipal = (
  query: RateLimitPrincipalQuery
) => Promise<string | undefined>;

export type RateLimitPrincipalResolverDependencies = {
  tokenService: Pick<TokenService, 'validateToken'>;
  sessionService?: Pick<SessionService, 'validateSession'>;
};

/**
 * Resolve a rate-limit principal from a validated session or bot token.
 * Unvalidated cookies and Bearer strings must not mint a bucket — they
 * fall through so the caller keys on IP.
 */
export const createRateLimitPrincipalResolver = (
  deps: RateLimitPrincipalResolverDependencies
): ResolveRateLimitPrincipal => {
  const { tokenService, sessionService } = deps;

  return async (query) => {
    if (sessionService !== undefined) {
      const sessionId = sessionIdFromCookieHeader(query.cookieHeader, query.sessionCookieName);
      if (sessionId !== undefined) {
        const sessionResult = await sessionService.validateSession(sessionId);
        if (sessionResult.isOk()) {
          const session = sessionResult.value;
          if (session !== null) {
            return session.userId;
          }
        }
      }
    }

    const plaintext = bearerPlaintext(query.authorization);
    if (plaintext === undefined) {
      return undefined;
    }

    const tokenResult = await tokenService.validateToken({ plaintext });
    if (tokenResult.isOk()) {
      return tokenResult.value.user.id;
    }
    return undefined;
  };
};
