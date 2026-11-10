import { err, ok, type Result } from 'neverthrow';
import {
  noMembershipsError,
  notAMemberError,
  sessionNotFoundError,
  type NoMembershipsError,
  type NotAMemberError,
  type SessionNotFoundError,
} from './auth-errors.js';
import type { UserSession } from './user-session.js';
import { userNotFoundError, type UserNotFoundError } from './user-errors.js';
import type { User } from './user.js';

/** Membership fields this decision reads. Role and joined-at stay unused. */
export type SessionMembership = {
  readonly organizationId: string;
  readonly isPersonalOrg: boolean;
};

/**
 * The user query goes in first. A missing user is refused before
 * memberships are loaded.
 */
export const decideSessionUser = (input: {
  readonly userId: string;
  readonly user: User | null;
}): Result<User, UserNotFoundError> => {
  if (!input.user) {
    return err(userNotFoundError(input.userId));
  }
  return ok(input.user);
};

/**
 * No memberships are refused before an organization is chosen. A requested
 * organization must be one of those memberships. Otherwise the personal
 * organization wins, then the first membership.
 */
export const decideCreateSession = (input: {
  readonly userId: string;
  readonly memberships: readonly SessionMembership[];
  readonly organizationId?: string;
  readonly now: string;
  readonly sessionId: string;
  readonly ttlMs: number;
}): Result<UserSession, NoMembershipsError | NotAMemberError> => {
  if (input.memberships.length === 0) {
    return err(noMembershipsError(input.userId));
  }

  const requested = input.organizationId;
  let targetOrgId: string;
  if (requested !== undefined) {
    const isMember = input.memberships.some((membership) => membership.organizationId === requested);
    if (!isMember) {
      return err(notAMemberError(input.userId, requested));
    }
    targetOrgId = requested;
  } else {
    const personalOrg = input.memberships.find((membership) => membership.isPersonalOrg);
    const first = input.memberships[0];
    if (first === undefined) {
      return err(noMembershipsError(input.userId));
    }
    targetOrgId = personalOrg?.organizationId ?? first.organizationId;
  }

  const nowMs = Date.parse(input.now);
  return ok({
    id: input.sessionId,
    userId: input.userId,
    currentOrganizationId: targetOrgId,
    createdAt: input.now,
    expiresAt: new Date(nowMs + input.ttlMs).toISOString(),
    lastActiveAt: input.now,
  });
};

/** An expired session is absent. The row stays until cleanup. */
export const decideVisibleSession = (input: {
  readonly session: UserSession | null;
  readonly nowMs: number;
}): UserSession | null => {
  if (!input.session) {
    return null;
  }
  if (Date.parse(input.session.expiresAt) < input.nowMs) {
    return null;
  }
  return input.session;
};

export type RefreshSessionDecision =
  | { readonly refresh: false }
  | { readonly refresh: true; readonly lastActiveAt: string };

/**
 * Missing, expired, and recently active sessions do not write.
 * A session past the threshold refreshes `lastActiveAt` to now.
 */
export const decideRefreshSession = (input: {
  readonly session: UserSession | null;
  readonly nowMs: number;
  readonly refreshThresholdMs: number;
}): RefreshSessionDecision => {
  const visible = decideVisibleSession({ session: input.session, nowMs: input.nowMs });
  if (!visible) {
    return { refresh: false };
  }
  const elapsed = input.nowMs - Date.parse(visible.lastActiveAt);
  if (elapsed < input.refreshThresholdMs) {
    return { refresh: false };
  }
  return { refresh: true, lastActiveAt: new Date(input.nowMs).toISOString() };
};

/**
 * A missing session is refused before membership is considered.
 * The target organization must be one of the user's memberships.
 */
export const decideSwitchSession = (input: {
  readonly session: UserSession | null;
  readonly sessionId: string;
  readonly organizationId: string;
  readonly memberships: readonly SessionMembership[];
}): Result<void, SessionNotFoundError | NotAMemberError> => {
  if (!input.session) {
    return err(sessionNotFoundError(input.sessionId));
  }
  const isMember = input.memberships.some(
    (membership) => membership.organizationId === input.organizationId
  );
  if (!isMember) {
    return err(notAMemberError(input.session.userId, input.organizationId));
  }
  return ok(undefined);
};
