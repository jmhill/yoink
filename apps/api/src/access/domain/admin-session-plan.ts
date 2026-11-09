import type { AdminSession } from './admin-session.js';

/** One admin session to sign. There is no table write. */
export type IssueAdminSessionPlan = {
  readonly kind: 'issue-admin-session';
  readonly session: AdminSession;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isIssueAdminSessionPlan = (plan: unknown): plan is IssueAdminSessionPlan => {
  if (!isRecord(plan) || plan.kind !== 'issue-admin-session' || !isRecord(plan.session)) {
    return false;
  }
  if (plan.session.isAdmin !== true || typeof plan.session.createdAt !== 'string') {
    return false;
  }
  return plan.session.sessionId === undefined || typeof plan.session.sessionId === 'string';
};

export const planAdminSession = (input: {
  readonly now: string;
  readonly sessionId?: string;
}): IssueAdminSessionPlan => ({
  kind: 'issue-admin-session',
  session: {
    isAdmin: true,
    createdAt: input.now,
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  },
});
