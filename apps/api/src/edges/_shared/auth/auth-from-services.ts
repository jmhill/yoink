import { errAsync } from 'neverthrow';
import { invalidTokenFormatError } from '../../../access/domain/auth-errors.js';
import {
  authenticateSessionWith,
  authenticateTokenWith,
  recordSessionActivityWith,
} from '../../../access/application/authenticate-principal.js';
import type { SessionService } from '../../../access/application/handle-session.js';
import type { TokenService } from '../../../access/application/handle-token.js';
import type { AuthenticateToken } from '../../../access/index.js';
import type { CombinedAuthMiddlewareDependencies } from './combined-auth-middleware.js';
import type { UserSessionMiddlewareDependencies } from './user-session-middleware.js';

/** Legacy callers still hold services. Production auth uses `Access` queries. */
export const combinedAuthFromServices = (deps: {
  readonly tokenService: TokenService;
  readonly sessionService: SessionService;
  readonly sessionCookieName: string;
}): CombinedAuthMiddlewareDependencies => ({
  authenticateToken: authenticateTokenWith(deps.tokenService),
  authenticateSession: authenticateSessionWith(deps.sessionService),
  recordSessionActivity: recordSessionActivityWith(deps.sessionService),
  sessionCookieName: deps.sessionCookieName,
});

export const userSessionAuthFromService = (
  sessionService: SessionService
): UserSessionMiddlewareDependencies => ({
  authenticateSession: authenticateSessionWith(sessionService),
  recordSessionActivity: recordSessionActivityWith(sessionService),
});

export const unauthenticatedToken: AuthenticateToken = () =>
  errAsync(invalidTokenFormatError());
