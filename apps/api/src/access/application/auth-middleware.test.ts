import { Writable } from 'node:stream';
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { PasswordHasher } from '@yoink/infrastructure';
import { createAuthMiddleware } from './auth-middleware.js';
import { AUTH_TRY_AGAIN_MESSAGE } from './token-validation-response.js';
import { createTokenService } from '../domain/token-service.js';
import type { Organization } from '../domain/organization.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import type { User } from '../domain/user.js';
import { createFakeUserStore } from '../infrastructure/fake-user-store.js';
import type { ApiToken } from '../domain/api-token.js';
import { createFakeTokenStore } from '../infrastructure/fake-token-store.js';
import { createFakePasswordHasher, createFakeClock } from '@yoink/infrastructure';

describe('authMiddleware', () => {
  let app: FastifyInstance;

  const testOrg: Organization = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Test Org',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const testUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    email: 'test@example.com',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const testToken: ApiToken = {
    id: '550e8400-e29b-41d4-a716-446655440003',
    userId: testUser.id,
    organizationId: testOrg.id,
    tokenHash: 'fake-hash:valid-token',
    name: 'test-token',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const agentUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440004',
    email: 'agent-550e8400-e29b-41d4-a716-446655440004@yoink.invalid',
    name: 'Lane',
    kind: 'agent',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const agentToken: ApiToken = {
    id: '550e8400-e29b-41d4-a716-446655440005',
    userId: agentUser.id,
    organizationId: testOrg.id,
    tokenHash: 'fake-hash:agent-token',
    name: 'Lane',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [testOrg],
    });

    const userStore = createFakeUserStore({
      initialUsers: [testUser, agentUser],
    });

    const tokenStore = createFakeTokenStore({
      initialTokens: [testToken, agentToken],
    });

    const tokenService = createTokenService({
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      clock: createFakeClock(new Date('2024-06-15T12:00:00.000Z')),
    });

    const authMiddleware = createAuthMiddleware({ tokenService });

    app = Fastify();
    app.addHook('preHandler', authMiddleware);

    app.get('/test', async (request) => {
      return { authContext: request.authContext };
    });

    await app.ready();
  });

  it('attaches a user actor for a person token', async () => {
    // Token format: tokenId:secret
    const validToken = `${testToken.id}:valid-token`;
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${validToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().authContext).toEqual({
      organizationId: testOrg.id,
      userId: testUser.id,
      principalKind: 'human',
      actor: { kind: 'user', userId: testUser.id, via: 'token' as const },
    });
  });

  it('attaches a bot actor for an agent token', async () => {
    const validToken = `${agentToken.id}:agent-token`;
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${validToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().authContext).toEqual({
      organizationId: testOrg.id,
      userId: agentUser.id,
      principalKind: 'agent',
      actor: {
        kind: 'bot',
        tokenId: agentToken.id,
        userId: agentUser.id,
        name: 'Lane',
        via: 'token' as const,
      },
    });
  });

  it('returns 401 for missing Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Missing authorization header');
  });

  it('returns 401 for non-Bearer authorization', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Missing authorization header');
  });

  it('returns 401 for invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer wrong-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Invalid token');
  });
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const logEntries = (lines: readonly string[]): Record<string, unknown>[] =>
  lines
    .join('')
    .split('\n')
    .flatMap((line) => {
      if (line.trim().length === 0) {
        return [];
      }
      const parsed: unknown = JSON.parse(line);
      return isRecord(parsed) ? [parsed] : [];
    });

const validationFailure = (lines: readonly string[]) =>
  logEntries(lines).find((entry) => entry.msg === 'Token validation failed');

describe('token check responses', () => {
  const tokenId = '550e8400-e29b-41d4-a716-446655440003';
  const secret = 'lane-bot-secret-9f3a';
  const userId = '550e8400-e29b-41d4-a716-446655440002';
  const organizationId = '550e8400-e29b-41d4-a716-446655440001';

  const organization: Organization = {
    id: organizationId,
    name: 'Test Org',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const user: User = {
    id: userId,
    email: 'lane@example.com',
    name: 'Lane',
    kind: 'agent',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const token: ApiToken = {
    id: tokenId,
    userId,
    organizationId,
    tokenHash: `fake-hash:${secret}`,
    name: 'Lane',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const start = async (options: {
    failFind?: boolean;
    revoke?: boolean;
    hasher?: PasswordHasher;
  } = {}) => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const tokenStore = createFakeTokenStore({
      shouldFailOnFind: options.failFind,
      initialTokens: [token],
    });
    if (options.revoke) {
      await tokenStore.revoke(tokenId, '2026-10-09T12:00:00.000Z');
    }

    const app = Fastify({ logger: { level: 'info', stream } });
    app.addHook(
      'preHandler',
      createAuthMiddleware({
        tokenService: createTokenService({
          organizationStore: createFakeOrganizationStore({ initialOrganizations: [organization] }),
          userStore: createFakeUserStore({ initialUsers: [user] }),
          tokenStore,
          passwordHasher: options.hasher ?? createFakePasswordHasher(),
          clock: createFakeClock(new Date('2024-06-15T12:00:00.000Z')),
        }),
      })
    );
    app.get('/test', async () => ({ ok: true }));
    await app.ready();
    return { app, lines };
  };

  const bearer = (value: string) => ({ authorization: `Bearer ${value}` });

  it('accepts a valid token and does not call it invalid', async () => {
    const { app, lines } = await start();
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: bearer(`${tokenId}:${secret}`),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).not.toContain('Invalid token');
    expect(lines.join('')).not.toContain(secret);
    await app.close();
  });

  it('asks the caller to try again when the database fails, and does not say the token is invalid', async () => {
    const { app, lines } = await start({ failFind: true });
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: bearer(`${tokenId}:${secret}`),
    });

    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ message: AUTH_TRY_AGAIN_MESSAGE });
    expect(response.headers['retry-after']).toBe('1');
    const failure = validationFailure(lines);
    expect(failure).toMatchObject({
      reason: 'TOKEN_STORAGE_ERROR',
      tokenId,
      error: { message: 'Find failed' },
    });
    expect(typeof failure?.durationMs).toBe('number');
    expect(lines.join('')).not.toContain(secret);
    await app.close();
  });

  it('asks the caller to try again when the hash comparison throws', async () => {
    const { app, lines } = await start({
      hasher: {
        hash: () => Promise.resolve('unused'),
        compare: () => {
          throw new Error('bcrypt stalled');
        },
      },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: bearer(`${tokenId}:${secret}`),
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().message).toBe(AUTH_TRY_AGAIN_MESSAGE);
    expect(validationFailure(lines)).toMatchObject({
      reason: 'TOKEN_HASH_ERROR',
      tokenId,
      error: { message: 'bcrypt stalled' },
    });
    expect(lines.join('')).not.toContain(secret);
    await app.close();
  });

  it('still tells a truly bad token that it is invalid', async () => {
    const { app, lines } = await start();
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: bearer(`${tokenId}:wrong-secret-value`),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ message: 'Invalid token' });
    expect(validationFailure(lines)).toMatchObject({
      reason: 'INVALID_SECRET',
      tokenId,
    });
    expect(lines.join('')).not.toContain('wrong-secret-value');
    await app.close();
  });

  it('logs not-found, revoked, and malformed tokens without the secret', async () => {
    const missing = await start();
    const missingResponse = await missing.app.inject({
      method: 'GET',
      url: '/test',
      headers: bearer('missing-token-id:missing-secret-value'),
    });
    expect(missingResponse.statusCode).toBe(401);
    expect(missingResponse.json().message).toBe('Invalid token');
    expect(validationFailure(missing.lines)).toMatchObject({
      reason: 'TOKEN_NOT_FOUND',
      tokenId: 'missing-token-id',
      subject: 'token',
    });
    expect(missing.lines.join('')).not.toContain('missing-secret-value');
    await missing.app.close();

    const revoked = await start({ revoke: true });
    const revokedResponse = await revoked.app.inject({
      method: 'GET',
      url: '/test',
      headers: bearer(`${tokenId}:${secret}`),
    });
    expect(revokedResponse.statusCode).toBe(401);
    expect(revokedResponse.json().message).toBe('Invalid token');
    expect(validationFailure(revoked.lines)).toMatchObject({
      reason: 'TOKEN_REVOKED',
      tokenId,
    });
    expect(revoked.lines.join('')).not.toContain(secret);
    await revoked.app.close();

    const malformed = await start();
    const malformedToken = 'not-a-valid-token-zzzz';
    const malformedResponse = await malformed.app.inject({
      method: 'GET',
      url: '/test',
      headers: bearer(malformedToken),
    });
    expect(malformedResponse.statusCode).toBe(401);
    expect(malformedResponse.json().message).toBe('Invalid token');
    expect(validationFailure(malformed.lines)).toMatchObject({
      reason: 'INVALID_TOKEN_FORMAT',
    });
    expect(malformed.lines.join('')).not.toContain(malformedToken);
    await malformed.app.close();
  });
});
