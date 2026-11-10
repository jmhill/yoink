import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Clock } from '../../kernel/clock.js';
import type { IdGenerator } from '../../kernel/id-generator.js';
import type { CommitFailure, UnitOfWork } from '../../kernel/unit-of-work.js';
import type { MembershipService } from './handle-membership.js';
import {
  sessionNotFoundError,
  sessionStorageError,
  type SessionServiceError,
  type SessionStorageError,
} from '../domain/auth-errors.js';
import {
  decideCreateSession,
  decideRefreshSession,
  decideSessionUser,
  decideSwitchSession,
  decideVisibleSession,
  type SessionMembership,
} from '../domain/decide-session.js';
import type { CreateSessionCommand } from '../domain/session-commands.js';
import {
  planDeleteExpiredSessions,
  planRefreshSession,
  planRevokeSession,
  planRevokeUserSessions,
  planSaveSession,
  planSwitchSessionOrganization,
  type SessionPlan,
} from '../domain/session-plan.js';
import type { UserSession } from '../domain/user-session.js';
import type { UserSessionStore } from '../domain/user-session-store.js';
import type { UserService } from '../domain/user-service.js';

export type { CreateSessionCommand } from '../domain/session-commands.js';

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
  /**
   * The composition root passes the sqlite unit of work. Each write then
   * commits through the access participant. Tests may omit it and apply
   * the same plan through the session store. Cookie setting stays in the edge.
   */
  unitOfWork?: UnitOfWork;
};

const storageMessage = (plan: SessionPlan): string => {
  switch (plan.kind) {
    case 'save-session':
      return 'Failed to save user session';
    case 'refresh-session':
      return 'Failed to update session last active';
    case 'revoke-session':
      return 'Failed to delete user session';
    case 'revoke-user-sessions':
      return 'Failed to delete user sessions by user';
    case 'switch-session-organization':
      return 'Failed to update session organization';
    case 'delete-expired-sessions':
      return 'Failed to delete expired sessions';
    default: {
      const _never: never = plan;
      return _never;
    }
  }
};

const membershipFacts = (
  memberships: readonly { organizationId: string; isPersonalOrg: boolean }[]
): SessionMembership[] =>
  memberships.map((membership) => ({
    organizationId: membership.organizationId,
    isPersonalOrg: membership.isPersonalOrg,
  }));

/**
 * Validate stays a read. Create, refresh, revoke, switch, and cleanup
 * decide from the command and the queries they need, then commit one
 * session plan. The edge still sets the cookie.
 */
export const createSessionService = (deps: SessionServiceDependencies): SessionService => {
  const persist = (plan: SessionPlan): ResultAsync<void, SessionStorageError> => {
    if (deps.unitOfWork === undefined) {
      switch (plan.kind) {
        case 'save-session':
          return deps.sessionStore.save(plan.session);
        case 'refresh-session':
          return deps.sessionStore.updateLastActive(plan.sessionId, plan.lastActiveAt);
        case 'revoke-session':
          return deps.sessionStore.delete(plan.sessionId);
        case 'revoke-user-sessions':
          return deps.sessionStore.deleteByUserId(plan.userId);
        case 'switch-session-organization':
          return deps.sessionStore.updateCurrentOrganization(plan.sessionId, plan.organizationId);
        case 'delete-expired-sessions':
          return deps.sessionStore.deleteExpired(plan.now).map(() => undefined);
        default: {
          const _never: never = plan;
          return _never;
        }
      }
    }
    return deps.unitOfWork
      .commit([
        {
          result: null,
          events: [],
          step: { owner: 'access', plan },
        },
      ])
      .map(() => undefined)
      .mapErr((failure: CommitFailure) => sessionStorageError(storageMessage(plan), failure));
  };

  return {
    createSession(command) {
      return deps.userService.getUser(command.userId).andThen((user) => {
        const subject = decideSessionUser({ userId: command.userId, user });
        if (subject.isErr()) {
          return errAsync(subject.error);
        }
        return deps.membershipService.listMemberships({ userId: command.userId }).andThen((memberships) => {
          const now = deps.clock.now();
          const decision = decideCreateSession({
            userId: command.userId,
            memberships: membershipFacts(memberships),
            ...(command.organizationId === undefined
              ? {}
              : { organizationId: command.organizationId }),
            now: now.toISOString(),
            sessionId: deps.idGenerator.generate(),
            ttlMs: deps.sessionTtlMs,
          });
          if (decision.isErr()) {
            return errAsync(decision.error);
          }
          return persist(planSaveSession(decision.value)).map(() => decision.value);
        });
      });
    },

    validateSession(sessionId) {
      return deps.sessionStore.findById(sessionId).map((session) =>
        decideVisibleSession({ session, nowMs: deps.clock.now().getTime() })
      );
    },

    refreshSession(sessionId) {
      return deps.sessionStore.findById(sessionId).andThen((session) => {
        const decision = decideRefreshSession({
          session,
          nowMs: deps.clock.now().getTime(),
          refreshThresholdMs: deps.refreshThresholdMs,
        });
        if (!decision.refresh) {
          return okAsync(false);
        }
        return persist(
          planRefreshSession({ sessionId, lastActiveAt: decision.lastActiveAt })
        ).map(() => true);
      });
    },

    revokeSession(sessionId) {
      return persist(planRevokeSession(sessionId));
    },

    revokeAllUserSessions(userId) {
      return persist(planRevokeUserSessions(userId));
    },

    switchOrganization(sessionId, organizationId) {
      return deps.sessionStore.findById(sessionId).andThen((session) => {
        if (!session) {
          return errAsync(sessionNotFoundError(sessionId));
        }
        return deps.membershipService
          .listMemberships({ userId: session.userId })
          .andThen((memberships) => {
            const decision = decideSwitchSession({
              session,
              sessionId,
              organizationId,
              memberships: membershipFacts(memberships),
            });
            if (decision.isErr()) {
              return errAsync(decision.error);
            }
            return persist(planSwitchSessionOrganization({ sessionId, organizationId }));
          });
      });
    },

    cleanupExpiredSessions() {
      const now = deps.clock.now().toISOString();
      return deps.sessionStore.countExpired(now).andThen((count) =>
        persist(planDeleteExpiredSessions(now)).map(() => count)
      );
    },
  };
};
