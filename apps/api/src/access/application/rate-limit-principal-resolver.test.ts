import { describe, expect, it } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { createRateLimitPrincipalResolver } from './rate-limit-principal-resolver.js';
import { invalidTokenFormatError } from '../domain/auth-errors.js';
import type { UserSession } from '../domain/user-session.js';

const sessionCookieName = 'yoink_session';

const validSession: UserSession = {
  id: '550e8400-e29b-41d4-a716-446655440050',
  userId: '550e8400-e29b-41d4-a716-446655440002',
  currentOrganizationId: '550e8400-e29b-41d4-a716-446655440001',
  createdAt: '2025-01-15T10:00:00.000Z',
  expiresAt: '2026-12-31T00:00:00.000Z',
  lastActiveAt: '2025-01-15T10:00:00.000Z',
};

describe('createRateLimitPrincipalResolver', () => {
  it('returns a user id only after the session or token is validated', async () => {
    const resolve = createRateLimitPrincipalResolver({
      tokenService: {
        validateToken: (query) =>
          query.plaintext === 'tok-1:secret'
            ? okAsync({
                organization: {
                  id: 'org-1',
                  name: 'Org',
                  createdAt: '2024-01-01T00:00:00.000Z',
                },
                user: {
                  id: 'user-token',
                  email: 'bot@example.com',
                  createdAt: '2024-01-01T00:00:00.000Z',
                },
                token: {
                  id: 'tok-1',
                  userId: 'user-token',
                  organizationId: 'org-1',
                  tokenHash: 'hash',
                  name: 'bot',
                  createdAt: '2024-01-01T00:00:00.000Z',
                },
              })
            : errAsync(invalidTokenFormatError()),
      },
      sessionService: {
        validateSession: (sessionId) =>
          okAsync(sessionId === validSession.id ? validSession : null),
      },
    });

    expect(
      await resolve({
        cookieHeader: `yoink_session=${validSession.id}`,
        sessionCookieName,
      })
    ).toBe(validSession.userId);

    expect(
      await resolve({
        authorization: 'Bearer tok-1:secret',
        sessionCookieName,
      })
    ).toBe('user-token');
  });

  it('returns undefined for random cookies and bearer strings', async () => {
    const resolve = createRateLimitPrincipalResolver({
      tokenService: {
        validateToken: () => errAsync(invalidTokenFormatError()),
      },
      sessionService: {
        validateSession: () => okAsync(null),
      },
    });

    expect(
      await resolve({
        cookieHeader: 'yoink_session=random-session-secret',
        sessionCookieName,
      })
    ).toBeUndefined();
    expect(
      await resolve({
        authorization: 'Bearer forged-id:forged-secret',
        sessionCookieName,
      })
    ).toBeUndefined();
    expect(
      await resolve({
        authorization: 'Bearer not-a-token',
        sessionCookieName,
      })
    ).toBeUndefined();
  });
});
