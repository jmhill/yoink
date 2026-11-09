import { describe, expect, it } from 'vitest';
import { isIssueAdminSessionPlan, planAdminSession } from './admin-session-plan.js';

describe('planAdminSession', () => {
  it('omits sessionId when none was generated', () => {
    const plan = planAdminSession({ now: '2024-06-15T12:00:00.000Z' });

    expect(plan).toEqual({
      kind: 'issue-admin-session',
      session: { isAdmin: true, createdAt: '2024-06-15T12:00:00.000Z' },
    });
    expect(isIssueAdminSessionPlan(plan)).toBe(true);
  });

  it('rejects a plan whose session is not an admin session', () => {
    expect(isIssueAdminSessionPlan({ kind: 'issue-admin-session', session: { isAdmin: false } })).toBe(
      false
    );
    expect(isIssueAdminSessionPlan({ kind: 'signup' })).toBe(false);
    expect(
      isIssueAdminSessionPlan({
        kind: 'issue-admin-session',
        session: { isAdmin: true, createdAt: '2024-06-15T12:00:00.000Z', sessionId: 1 },
      })
    ).toBe(false);
  });
});
