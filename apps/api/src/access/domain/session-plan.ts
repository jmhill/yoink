import type { UserSession } from './user-session.js';

/**
 * One user-session write this service owns. The access participant compiles
 * it. The unit of work does not inspect it. Cookie setting stays in the edge.
 */
export type SaveSessionPlan = {
  readonly kind: 'save-session';
  readonly session: UserSession;
};

export type RefreshSessionPlan = {
  readonly kind: 'refresh-session';
  readonly sessionId: string;
  readonly lastActiveAt: string;
};

export type RevokeSessionPlan = {
  readonly kind: 'revoke-session';
  readonly sessionId: string;
};

export type RevokeUserSessionsPlan = {
  readonly kind: 'revoke-user-sessions';
  readonly userId: string;
};

export type SwitchSessionOrganizationPlan = {
  readonly kind: 'switch-session-organization';
  readonly sessionId: string;
  readonly organizationId: string;
};

export type DeleteExpiredSessionsPlan = {
  readonly kind: 'delete-expired-sessions';
  readonly now: string;
};

export type SessionPlan =
  | SaveSessionPlan
  | RefreshSessionPlan
  | RevokeSessionPlan
  | RevokeUserSessionsPlan
  | SwitchSessionOrganizationPlan
  | DeleteExpiredSessionsPlan;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasString = (value: unknown, key: string): boolean =>
  isRecord(value) && typeof value[key] === 'string';

export const isSessionPlan = (plan: unknown): plan is SessionPlan => {
  if (!isRecord(plan)) {
    return false;
  }
  if (plan.kind === 'save-session') {
    return (
      hasString(plan.session, 'id') &&
      hasString(plan.session, 'userId') &&
      hasString(plan.session, 'currentOrganizationId') &&
      hasString(plan.session, 'createdAt') &&
      hasString(plan.session, 'expiresAt') &&
      hasString(plan.session, 'lastActiveAt')
    );
  }
  if (plan.kind === 'refresh-session') {
    return typeof plan.sessionId === 'string' && typeof plan.lastActiveAt === 'string';
  }
  if (plan.kind === 'revoke-session') {
    return typeof plan.sessionId === 'string';
  }
  if (plan.kind === 'revoke-user-sessions') {
    return typeof plan.userId === 'string';
  }
  if (plan.kind === 'switch-session-organization') {
    return typeof plan.sessionId === 'string' && typeof plan.organizationId === 'string';
  }
  if (plan.kind === 'delete-expired-sessions') {
    return typeof plan.now === 'string';
  }
  return false;
};

export const planSaveSession = (session: UserSession): SaveSessionPlan => ({
  kind: 'save-session',
  session,
});

export const planRefreshSession = (input: {
  readonly sessionId: string;
  readonly lastActiveAt: string;
}): RefreshSessionPlan => ({
  kind: 'refresh-session',
  sessionId: input.sessionId,
  lastActiveAt: input.lastActiveAt,
});

/** A missing id is still a delete. The store delete does not refuse it. */
export const planRevokeSession = (sessionId: string): RevokeSessionPlan => ({
  kind: 'revoke-session',
  sessionId,
});

export const planRevokeUserSessions = (userId: string): RevokeUserSessionsPlan => ({
  kind: 'revoke-user-sessions',
  userId,
});

export const planSwitchSessionOrganization = (input: {
  readonly sessionId: string;
  readonly organizationId: string;
}): SwitchSessionOrganizationPlan => ({
  kind: 'switch-session-organization',
  sessionId: input.sessionId,
  organizationId: input.organizationId,
});

export const planDeleteExpiredSessions = (now: string): DeleteExpiredSessionsPlan => ({
  kind: 'delete-expired-sessions',
  now,
});
