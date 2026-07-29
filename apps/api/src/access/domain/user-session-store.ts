import type { ResultAsync } from 'neverthrow';
import type { UserSession } from './user-session.js';
import type { SessionStorageError } from './auth-errors.js';

/**
 * Port interface for user session persistence.
 *
 * Sessions are stored server-side to allow revocation and tracking.
 */
export type UserSessionStore = {
  /** Create a new session */
  save(session: UserSession): ResultAsync<void, SessionStorageError>;

  /** Find a session by its ID */
  findById(sessionId: string): ResultAsync<UserSession | null, SessionStorageError>;

  /** Find all sessions for a user */
  findByUserId(userId: string): ResultAsync<UserSession[], SessionStorageError>;

  /** Update the last active timestamp (for session refresh) */
  updateLastActive(
    sessionId: string,
    timestamp: string
  ): ResultAsync<void, SessionStorageError>;

  /** Update the current organization (when user switches orgs) */
  updateCurrentOrganization(
    sessionId: string,
    organizationId: string
  ): ResultAsync<void, SessionStorageError>;

  /** Delete a session (logout) */
  delete(sessionId: string): ResultAsync<void, SessionStorageError>;

  /** Delete all sessions for a user (logout everywhere) */
  deleteByUserId(userId: string): ResultAsync<void, SessionStorageError>;

  /** Delete expired sessions (cleanup) */
  deleteExpired(now: string): ResultAsync<number, SessionStorageError>;
};
