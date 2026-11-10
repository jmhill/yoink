import { okAsync } from 'neverthrow';
import { actorFromSession, actorFromToken } from '../../kernel/auth-context.js';
import type { SessionService } from './handle-session.js';
import type { AuthResult, TokenService } from './handle-token.js';
import { principalKindOf } from '../domain/user.js';
import type {
  AccessStorageError,
  AuthenticateSession,
  AuthenticateToken,
  AuthenticatedSession,
  AuthenticatedToken,
  RecordSessionActivity,
} from './access-types.js';

const storageError = (error: unknown, fallback: string): AccessStorageError => {
  const message =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.length > 0
      ? error.message
      : fallback;
  return { type: 'ACCESS_STORAGE', message };
};

export const authenticatedTokenFrom = (result: AuthResult): AuthenticatedToken => {
  const principalKind = principalKindOf(result.user);
  return {
    organizationId: result.organization.id,
    userId: result.user.id,
    principalKind,
    actor: actorFromToken(result.token, principalKind),
  };
};

export const authenticatedSessionFrom = (
  session: NonNullable<AuthenticatedSession['session']>
): AuthenticatedSession => ({
  organizationId: session.currentOrganizationId,
  userId: session.userId,
  principalKind: 'human',
  actor: actorFromSession(session.userId),
  session,
});

/** Pass the closed token error through. The auth edge maps each case. */
export const authenticateTokenWith =
  (tokenService: TokenService): AuthenticateToken =>
  (plaintext) => tokenService.validateToken({ plaintext }).map(authenticatedTokenFrom);

export const authenticateSessionWith =
  (sessionService: SessionService): AuthenticateSession =>
  (sessionId) =>
    sessionService
      .validateSession(sessionId)
      .map((session) => (session === null ? null : authenticatedSessionFrom(session)))
      .mapErr((error) => storageError(error, 'Session validation failed'));

export const recordSessionActivityWith =
  (sessionService: SessionService): RecordSessionActivity =>
  (sessionId) =>
    sessionService
      .refreshSession(sessionId)
      .mapErr((error) => storageError(error, 'Session refresh failed'));

export const idleSession = (): AuthenticateSession => () => okAsync(null);

export const idleActivity = (): RecordSessionActivity => () => okAsync(false);
