import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { Clock, IdGenerator } from '@yoink/infrastructure';
import type { UserSession } from './user-session.js';
import type { UserSessionStore } from './user-session-store.js';
import type { UserService } from '../../users/domain/user-service.js';
import type { MembershipService } from '../../organizations/domain/membership-service.js';
import {
  noMembershipsError,
  notAMemberError,
  sessionNotFoundError,
  type SessionServiceError,
} from './auth-errors.js';
import { userNotFoundError } from '../../users/domain/user-errors.js';

// ============================================================================
// Commands (input types)
// ============================================================================

export type CreateSessionCommand = {
  userId: string;
  /** Optional: specify which org to start in (must be a member) */
  organizationId?: string;
};

// ============================================================================
// Service Interface
// ============================================================================

export type SessionService = {
  /**
   * Create a new session for a user after successful authentication.
   * Defaults to their personal org (or first membership) if no org specified.
   */
  createSession(command: CreateSessionCommand): ResultAsync<UserSession, SessionServiceError>;

  /**
   * Validate a session by ID. Returns null if expired or not found.
   */
  validateSession(sessionId: string): ResultAsync<UserSession | null, SessionServiceError>;

  /**
   * Refresh a session's lastActiveAt if it's been idle for a while.
   * Returns true if refreshed, false if session not found or recently active.
   */
  refreshSession(sessionId: string): ResultAsync<boolean, SessionServiceError>;

  /**
   * Revoke (delete) a specific session.
   */
  revokeSession(sessionId: string): ResultAsync<void, SessionServiceError>;

  /**
   * Revoke all sessions for a user (logout everywhere).
   */
  revokeAllUserSessions(userId: string): ResultAsync<void, SessionServiceError>;

  /**
   * Switch the current organization for a session.
   * Fails if user is not a member of the target organization.
   */
  switchOrganization(
    sessionId: string,
    organizationId: string
  ): ResultAsync<void, SessionServiceError>;

  /**
   * Delete expired sessions. Returns count of deleted sessions.
   */
  cleanupExpiredSessions(): ResultAsync<number, SessionServiceError>;
};

// ============================================================================
// Dependencies
// ============================================================================

export type SessionServiceDependencies = {
  sessionStore: UserSessionStore;
  userService: UserService;
  membershipService: MembershipService;
  clock: Clock;
  idGenerator: IdGenerator;
  /** Session TTL in milliseconds (default: 7 days) */
  sessionTtlMs: number;
  /** How long before we refresh lastActiveAt (default: 1 day) */
  refreshThresholdMs: number;
};

// ============================================================================
// Implementation
// ============================================================================

export const createSessionService = (
  deps: SessionServiceDependencies
): SessionService => {
  const {
    sessionStore,
    userService,
    membershipService,
    clock,
    idGenerator,
    sessionTtlMs,
    refreshThresholdMs,
  } = deps;

  return {
    createSession(command: CreateSessionCommand): ResultAsync<UserSession, SessionServiceError> {
      const { userId, organizationId } = command;

      // Verify user exists via UserService
      return userService.getUser(userId).andThen((user) => {
        if (!user) {
          return errAsync(userNotFoundError(userId));
        }

        // Get user's memberships via MembershipService
        return membershipService.listMemberships({ userId }).andThen((memberships) => {
          if (memberships.length === 0) {
            return errAsync(noMembershipsError(userId));
          }

          // Determine which org to use
          let targetOrgId: string;
          if (organizationId) {
            // Check if user is a member of the specified org
            const isMember = memberships.some((m) => m.organizationId === organizationId);
            if (!isMember) {
              return errAsync(notAMemberError(userId, organizationId));
            }
            targetOrgId = organizationId;
          } else {
            // Default to personal org (isPersonalOrg=true) or first membership
            const personalOrg = memberships.find((m) => m.isPersonalOrg);
            targetOrgId = personalOrg?.organizationId ?? memberships[0].organizationId;
          }

          const now = clock.now();
          const session: UserSession = {
            id: idGenerator.generate(),
            userId,
            currentOrganizationId: targetOrgId,
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + sessionTtlMs).toISOString(),
            lastActiveAt: now.toISOString(),
          };

          return sessionStore.save(session).map(() => session);
        });
      });
    },

    validateSession(sessionId: string): ResultAsync<UserSession | null, SessionServiceError> {
      return sessionStore.findById(sessionId).map((session) => {
        if (!session) {
          return null;
        }

        // Check if expired
        const now = clock.now();
        if (new Date(session.expiresAt) < now) {
          return null;
        }

        return session;
      });
    },

    refreshSession(sessionId: string): ResultAsync<boolean, SessionServiceError> {
      return sessionStore.findById(sessionId).andThen((session) => {
        if (!session) {
          return okAsync(false);
        }

        // Check if expired
        const now = clock.now();
        if (new Date(session.expiresAt) < now) {
          return okAsync(false);
        }

        // Check if recently active (no refresh needed)
        const lastActive = new Date(session.lastActiveAt);
        const timeSinceActive = now.getTime() - lastActive.getTime();
        if (timeSinceActive < refreshThresholdMs) {
          return okAsync(false);
        }

        // Update lastActiveAt
        return sessionStore
          .updateLastActive(sessionId, now.toISOString())
          .map(() => true);
      });
    },

    revokeSession(sessionId: string): ResultAsync<void, SessionServiceError> {
      return sessionStore.delete(sessionId);
    },

    revokeAllUserSessions(userId: string): ResultAsync<void, SessionServiceError> {
      return sessionStore.deleteByUserId(userId);
    },

    switchOrganization(
      sessionId: string,
      organizationId: string
    ): ResultAsync<void, SessionServiceError> {
      return sessionStore.findById(sessionId).andThen((session) => {
        if (!session) {
          return errAsync(sessionNotFoundError(sessionId));
        }

        // Check if user is a member of the target org via MembershipService
        return membershipService.listMemberships({ userId: session.userId }).andThen((memberships) => {
          const isMember = memberships.some((m) => m.organizationId === organizationId);
          if (!isMember) {
            return errAsync(notAMemberError(session.userId, organizationId));
          }

          return sessionStore.updateCurrentOrganization(sessionId, organizationId);
        });
      });
    },

    cleanupExpiredSessions(): ResultAsync<number, SessionServiceError> {
      const now = clock.now().toISOString();
      return sessionStore.deleteExpired(now);
    },
  };
};
