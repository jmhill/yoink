import { describe, expect, it } from 'vitest';
import {
  decideCreateSession,
  decideRefreshSession,
  decideSessionUser,
  decideSwitchSession,
  decideVisibleSession,
} from './decide-session.js';
import type { User } from './user.js';
import type { UserSession } from './user-session.js';

const NOW = '2024-06-15T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const TTL = 7 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const human = (): User => ({
  id: 'user-1',
  email: 'alice@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
});

const session = (overrides: Partial<UserSession> = {}): UserSession => ({
  id: 'session-1',
  userId: 'user-1',
  currentOrganizationId: 'org-1',
  createdAt: NOW,
  expiresAt: '2024-06-22T12:00:00.000Z',
  lastActiveAt: NOW,
  ...overrides,
});

describe('decide session', () => {
  it('refuses a missing user before memberships are considered', () => {
    const decision = decideSessionUser({ userId: 'missing', user: null });
    expect(decision.isErr() && decision.error.type).toBe('USER_NOT_FOUND');
  });

  it('accepts a user that exists', () => {
    const decision = decideSessionUser({ userId: 'user-1', user: human() });
    expect(decision.isOk() && decision.value.id).toBe('user-1');
  });

  it('refuses a user with no memberships', () => {
    const decision = decideCreateSession({
      userId: 'user-1',
      memberships: [],
      now: NOW,
      sessionId: 'session-1',
      ttlMs: TTL,
    });
    expect(decision.isErr() && decision.error.type).toBe('NO_MEMBERSHIPS');
  });

  it('uses the personal organization when none is requested', () => {
    const decision = decideCreateSession({
      userId: 'user-1',
      memberships: [
        { organizationId: 'org-2', isPersonalOrg: false },
        { organizationId: 'org-1', isPersonalOrg: true },
      ],
      now: NOW,
      sessionId: 'session-1',
      ttlMs: TTL,
    });
    expect(decision.isOk() && decision.value.currentOrganizationId).toBe('org-1');
    expect(decision.isOk() && decision.value.expiresAt).toBe('2024-06-22T12:00:00.000Z');
    expect(decision.isOk() && decision.value.lastActiveAt).toBe(NOW);
  });

  it('uses the first membership when there is no personal organization', () => {
    const decision = decideCreateSession({
      userId: 'user-1',
      memberships: [{ organizationId: 'org-2', isPersonalOrg: false }],
      now: NOW,
      sessionId: 'session-1',
      ttlMs: TTL,
    });
    expect(decision.isOk() && decision.value.currentOrganizationId).toBe('org-2');
  });

  it('uses a requested organization the user belongs to', () => {
    const decision = decideCreateSession({
      userId: 'user-1',
      memberships: [
        { organizationId: 'org-1', isPersonalOrg: true },
        { organizationId: 'org-2', isPersonalOrg: false },
      ],
      organizationId: 'org-2',
      now: NOW,
      sessionId: 'session-1',
      ttlMs: TTL,
    });
    expect(decision.isOk() && decision.value.currentOrganizationId).toBe('org-2');
  });

  it('refuses a requested organization the user does not belong to', () => {
    const decision = decideCreateSession({
      userId: 'user-1',
      memberships: [{ organizationId: 'org-1', isPersonalOrg: true }],
      organizationId: 'org-missing',
      now: NOW,
      sessionId: 'session-1',
      ttlMs: TTL,
    });
    expect(decision.isErr() && decision.error.type).toBe('NOT_A_MEMBER');
  });

  it('hides a missing or expired session', () => {
    expect(decideVisibleSession({ session: null, nowMs: NOW_MS })).toBeNull();
    expect(
      decideVisibleSession({
        session: session({ expiresAt: '2024-06-14T12:00:00.000Z' }),
        nowMs: NOW_MS,
      })
    ).toBeNull();
    expect(decideVisibleSession({ session: session(), nowMs: NOW_MS })?.id).toBe('session-1');
  });

  it('refreshes only a visible session past the threshold', () => {
    expect(
      decideRefreshSession({ session: null, nowMs: NOW_MS, refreshThresholdMs: DAY }).refresh
    ).toBe(false);
    expect(
      decideRefreshSession({
        session: session({ expiresAt: '2024-06-14T12:00:00.000Z' }),
        nowMs: NOW_MS,
        refreshThresholdMs: DAY,
      }).refresh
    ).toBe(false);
    expect(
      decideRefreshSession({
        session: session(),
        nowMs: NOW_MS + 60 * 60 * 1000,
        refreshThresholdMs: DAY,
      }).refresh
    ).toBe(false);
    const due = decideRefreshSession({
      session: session(),
      nowMs: NOW_MS + 2 * DAY,
      refreshThresholdMs: DAY,
    });
    expect(due.refresh && due.lastActiveAt).toBe('2024-06-17T12:00:00.000Z');
  });

  it('refuses a missing session before membership, then a non-member', () => {
    const missing = decideSwitchSession({
      session: null,
      sessionId: 'gone',
      organizationId: 'org-2',
      memberships: [{ organizationId: 'org-2', isPersonalOrg: false }],
    });
    expect(missing.isErr() && missing.error.type).toBe('SESSION_NOT_FOUND');

    const outsider = decideSwitchSession({
      session: session(),
      sessionId: 'session-1',
      organizationId: 'org-missing',
      memberships: [{ organizationId: 'org-1', isPersonalOrg: true }],
    });
    expect(outsider.isErr() && outsider.error.type).toBe('NOT_A_MEMBER');

    const member = decideSwitchSession({
      session: session(),
      sessionId: 'session-1',
      organizationId: 'org-2',
      memberships: [
        { organizationId: 'org-1', isPersonalOrg: true },
        { organizationId: 'org-2', isPersonalOrg: false },
      ],
    });
    expect(member.isOk()).toBe(true);
  });
});
