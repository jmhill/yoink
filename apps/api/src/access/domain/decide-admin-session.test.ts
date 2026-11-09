import { describe, expect, it } from 'vitest';
import { decideAdminLogin, decideAdminSession } from './decide-admin-session.js';
import { isIssueAdminSessionPlan } from './admin-session-plan.js';

const NOW = '2024-06-15T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const DAY_MS = 24 * 60 * 60 * 1000;

describe('decideAdminLogin', () => {
  it('refuses a password that does not match', () => {
    const decision = decideAdminLogin({ passwordMatches: false, now: NOW });

    expect(decision.isErr() && decision.error.type).toBe('INVALID_ADMIN_PASSWORD');
  });

  it('plans a session without a session id', () => {
    const decision = decideAdminLogin({ passwordMatches: true, now: NOW });

    expect(decision.isOk() && decision.value).toEqual({
      kind: 'issue-admin-session',
      session: { isAdmin: true, createdAt: NOW },
    });
    expect(decision.isOk() && isIssueAdminSessionPlan(decision.value)).toBe(true);
  });

  it('keeps the session id on the plan when one was generated', () => {
    const decision = decideAdminLogin({
      passwordMatches: true,
      now: NOW,
      sessionId: 'session-1',
    });

    expect(decision.isOk() && decision.value.session.sessionId).toBe('session-1');
  });
});

describe('decideAdminSession', () => {
  const session = { isAdmin: true as const, createdAt: NOW, sessionId: 'session-1' };

  it('accepts a session inside the ttl', () => {
    const decision = decideAdminSession({
      candidate: session,
      nowMs: NOW_MS + 23 * 60 * 60 * 1000,
      ttlMs: DAY_MS,
    });

    expect(decision.isOk() && decision.value).toBe(session);
  });

  it('accepts a session at the exact ttl boundary', () => {
    const decision = decideAdminSession({
      candidate: session,
      nowMs: NOW_MS + DAY_MS,
      ttlMs: DAY_MS,
    });

    expect(decision.isOk()).toBe(true);
  });

  it('expires a session past the ttl', () => {
    const decision = decideAdminSession({
      candidate: session,
      nowMs: NOW_MS + DAY_MS + 1,
      ttlMs: DAY_MS,
    });

    expect(decision.isErr() && decision.error.type).toBe('EXPIRED_ADMIN_SESSION');
  });

  it('rejects a payload that is not an admin session', () => {
    const candidates = [null, { isAdmin: false, createdAt: NOW }, { isAdmin: true }];
    for (const candidate of candidates) {
      const decision = decideAdminSession({ candidate, nowMs: NOW_MS, ttlMs: DAY_MS });
      expect(decision.isErr() && decision.error.type).toBe('INVALID_ADMIN_SESSION');
    }
  });

  it('keeps an unparseable createdAt, matching the previous comparison', () => {
    const candidate = { isAdmin: true as const, createdAt: 'not-a-date' };
    const decision = decideAdminSession({
      candidate,
      nowMs: NOW_MS,
      ttlMs: DAY_MS,
    });

    expect(decision.isOk() && decision.value).toBe(candidate);
  });
});
