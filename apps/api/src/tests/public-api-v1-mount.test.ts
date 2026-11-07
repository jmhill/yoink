import cookie from '@fastify/cookie';
import { ProcedureContract } from '@orpc/contract';
import { getOpenAPIMeta } from '@orpc/openapi';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import {
  createFakeClock,
  createFakeIdGenerator,
  createFakePasswordHasher,
} from '@yoink/infrastructure';
import Fastify from 'fastify';
import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import type { ApiToken } from '../access/domain/api-token.js';
import type { OrganizationMembership } from '../access/domain/organization-membership.js';
import type { Organization } from '../access/domain/organization.js';
import { createMembershipService } from '../access/domain/membership-service.js';
import { createSessionService } from '../access/domain/session-service.js';
import { createTokenService } from '../access/domain/token-service.js';
import type { UserSession } from '../access/domain/user-session.js';
import type { User } from '../access/domain/user.js';
import { createUserService } from '../access/domain/user-service.js';
import { captureNotInInboxError } from '../captures/domain/capture-errors.js';
import {
  createAuthMiddleware,
  createCombinedAuthMiddleware,
  registerTokenMutationRoutes,
} from '../access/application/index.js';
import type { TokenHandlers } from '../access/application/create-token-handlers.js';
import { USER_SESSION_COOKIE } from '../access/application/combined-auth-middleware.js';
import { createFakeOrganizationMembershipStore } from '../access/infrastructure/fake-organization-membership-store.js';
import { createFakeOrganizationStore } from '../access/infrastructure/fake-organization-store.js';
import { createFakeTokenStore } from '../access/infrastructure/fake-token-store.js';
import { createFakeUserSessionStore } from '../access/infrastructure/fake-user-session-store.js';
import { createFakeUserStore } from '../access/infrastructure/fake-user-store.js';
import type { CaptureHandlers } from '../captures/application/create-capture-handlers.js';
import {
  PUBLIC_API_ALIAS_MIN_WINDOW_MS,
  publicApiV1Routes,
  registerPublicApiV1,
  type PublicApiV1Dependencies,
} from '../edges/public-api/v1/index.js';

const fastifyPath = (path: string) => path.replace(/\{([^}]+)\}/g, ':$1');

const contractProcedures = (router: unknown, key: string[] = []): { key: string; method: string; path: string }[] => {
  if (router instanceof ProcedureContract) {
    const meta = getOpenAPIMeta(router);
    return [{ key: key.join('.'), method: meta?.method ?? '', path: fastifyPath(meta?.path ?? '') }];
  }
  if (typeof router !== 'object' || router === null) return [];
  return Object.entries(router).flatMap(([name, value]) => contractProcedures(value, [...key, name]));
};

const mountedKeys = publicApiV1Routes.flatMap((route) => {
  const methods = typeof route.method === 'string' ? [route.method] : [...route.method];
  return methods.map((method) => `${method} ${route.path}`);
});

const stub = <T extends object>(): T =>
  new Proxy({} as T, {
    get: (target, prop, receiver) => {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
      return () => {
        throw new Error(`unexpected ${String(prop)}`);
      };
    },
  });

describe('public API v1 mount', () => {
  it('covers every frozen integration procedure, including token list', () => {
    const procedures = contractProcedures(publicApiV1Contract);
    expect(procedures).toHaveLength(59);
    const expected = procedures.map((procedure) => `${procedure.method} ${procedure.path}`);
    expect(new Set(mountedKeys)).toEqual(new Set(expected));
    expect(mountedKeys).toHaveLength(59);
    expect(mountedKeys).toContain('GET /auth/tokens');
    expect(mountedKeys.some((key) => key.includes('/health') || key === 'POST /auth/tokens' || key.startsWith('DELETE /auth/tokens'))).toBe(false);
  });

  it('serves a token on /api/v1, rejects a session there, and marks the alias', async () => {
    const org: Organization = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Test Org',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const user: User = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      email: 'test@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const agent: User = {
      id: '550e8400-e29b-41d4-a716-446655440005',
      email: 'agent-550e8400-e29b-41d4-a716-446655440005@yoink.invalid',
      name: 'Lane',
      kind: 'agent',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const token: ApiToken = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      userId: user.id,
      organizationId: org.id,
      tokenHash: 'fake-hash:valid-token',
      name: 'test-token',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const agentToken: ApiToken = {
      id: '550e8400-e29b-41d4-a716-446655440006',
      userId: agent.id,
      organizationId: org.id,
      tokenHash: 'fake-hash:agent-token',
      name: 'Lane',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const membership: OrganizationMembership = {
      id: '550e8400-e29b-41d4-a716-446655440010',
      userId: user.id,
      organizationId: org.id,
      role: 'admin',
      isPersonalOrg: true,
      joinedAt: '2024-01-01T00:00:00.000Z',
    };
    const session: UserSession = {
      id: '550e8400-e29b-41d4-a716-446655440004',
      userId: user.id,
      currentOrganizationId: org.id,
      createdAt: '2024-01-01T00:00:00.000Z',
      expiresAt: '2024-12-31T00:00:00.000Z',
      lastActiveAt: '2024-06-15T12:00:00.000Z',
    };
    const clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    const organizationStore = createFakeOrganizationStore({ initialOrganizations: [org] });
    const userStore = createFakeUserStore({ initialUsers: [user, agent] });
    const tokenStore = createFakeTokenStore({ initialTokens: [token, agentToken] });
    const tokenService = createTokenService({
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      clock,
    });
    const userService = createUserService({ userStore });
    const membershipService = createMembershipService({
      membershipStore: createFakeOrganizationMembershipStore({ initialMemberships: [membership] }),
      userService,
      organizationStore,
      clock,
      idGenerator: createFakeIdGenerator(),
    });
    const sessionService = createSessionService({
      sessionStore: createFakeUserSessionStore({ initialSessions: [session] }),
      userService,
      membershipService,
      clock,
      idGenerator: createFakeIdGenerator(),
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
      refreshThresholdMs: 24 * 60 * 60 * 1000,
    });
    const captureView = {
      id: '550e8400-e29b-41d4-a716-446655440010',
      organizationId: org.id,
      createdById: user.id,
      content: 'Hello',
      status: 'inbox' as const,
      capturedAt: '2026-10-12T01:00:00.000Z',
    };
    const captureHandlers = stub<CaptureHandlers>();
    captureHandlers.create = () =>
      okAsync({
        event: {
          type: 'CaptureCreated',
          id: captureView.id,
          organizationId: captureView.organizationId,
          createdById: captureView.createdById,
          content: captureView.content,
          capturedAt: captureView.capturedAt,
        },
        view: captureView,
      });
    captureHandlers.list = () =>
      okAsync({ items: [], hasMore: false, nextCursor: null, total: 0 });
    const captureProcessingService = stub<PublicApiV1Dependencies['captureProcessingService']>();
    captureProcessingService.processCaptureToTask = () =>
      errAsync(captureNotInInboxError(captureView.id));
    const tokenHandlers = stub<TokenHandlers>();
    tokenHandlers.list = () =>
      okAsync({
        tokens: [{ id: token.id, name: token.name, createdAt: token.createdAt, lastUsedAt: undefined }],
      });
    tokenHandlers.create = () =>
      okAsync({
        event: {
          type: 'TokenCreated',
          id: token.id,
          userId: user.id,
          organizationId: org.id,
          name: 'Created',
          createdAt: token.createdAt,
        },
        token: { id: token.id, name: 'Created', createdAt: token.createdAt, lastUsedAt: undefined },
        rawToken: `${token.id}:created-secret`,
      });
    tokenHandlers.revoke = () =>
      okAsync({
        type: 'TokenRevoked',
        id: token.id,
        userId: user.id,
        organizationId: org.id,
        revokedAt: token.createdAt,
      });
    const lines: string[] = [];
    const app = Fastify({
      logger: { level: 'info', stream: { write: (message: string) => lines.push(message) } },
    });
    await app.register(cookie);
    const deps = stub<PublicApiV1Dependencies>();
    deps.captureHandlers = captureHandlers;
    deps.captureProcessingService = captureProcessingService;
    deps.tokenHandlers = tokenHandlers;
    deps.aliasRetirement = undefined;
    deps.tokenAuth = createAuthMiddleware({ tokenService });
    deps.aliasAuth = createCombinedAuthMiddleware({
      tokenService,
      sessionService,
      sessionCookieName: USER_SESSION_COOKIE,
    });
    await registerPublicApiV1(app, deps);
    await registerTokenMutationRoutes(app, {
      tokenHandlers,
      sessionService,
      tokenService,
      sessionCookieName: USER_SESSION_COOKIE,
    });

    const sessionOnly = await app.inject({
      method: 'POST',
      url: '/api/v1/captures',
      payload: { content: 'Hello' },
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(sessionOnly.statusCode).toBe(401);
    expect(sessionOnly.json()).toEqual({ message: 'Missing authorization header' });
    expect(sessionOnly.headers.deprecation).toBeUndefined();
    expect(sessionOnly.headers.sunset).toBeUndefined();
    expect(sessionOnly.headers.link).toBeUndefined();

    const bearer = `${token.id}:valid-token`;
    const v1 = await app.inject({
      method: 'POST',
      url: '/api/v1/captures',
      payload: { content: 'Hello' },
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(v1.statusCode).toBe(201);
    expect(v1.json()).toMatchObject({ id: captureView.id, content: 'Hello' });
    expect(v1.headers.deprecation).toBeUndefined();
    expect(v1.headers.sunset).toBeUndefined();
    expect(v1.headers.link).toBeUndefined();

    const alias = await app.inject({
      method: 'POST',
      url: '/api/captures?from=web',
      payload: { content: 'Hello' },
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(alias.statusCode).toBe(201);
    expect(alias.headers.deprecation).toBeUndefined();
    expect(alias.headers.sunset).toBeUndefined();
    expect(alias.headers.link).toBe('</api/v1/captures?from=web>; rel="successor-version"');

    const aliasList = await app.inject({
      method: 'GET',
      url: '/api/captures',
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(aliasList.statusCode).toBe(200);
    expect(aliasList.json()).toEqual({ captures: [], hasMore: false, nextCursor: null, total: 0 });
    expect(aliasList.headers.deprecation).toBeUndefined();
    expect(aliasList.headers.sunset).toBeUndefined();
    expect(aliasList.headers.link).toBe('</api/v1/captures>; rel="successor-version"');

    const sessionTokenList = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/tokens',
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(sessionTokenList.statusCode).toBe(401);
    expect(sessionTokenList.json()).toEqual({ message: 'Missing authorization header' });
    expect(sessionTokenList.headers.deprecation).toBeUndefined();
    expect(sessionTokenList.headers.sunset).toBeUndefined();
    expect(sessionTokenList.headers.link).toBeUndefined();

    const humanLogAt = lines.length;
    const v1TokenList = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/tokens',
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(v1TokenList.statusCode).toBe(200);
    expect(v1TokenList.json()).toEqual({
      tokens: [{ id: token.id, name: token.name, createdAt: token.createdAt }],
    });
    expect(v1TokenList.headers.deprecation).toBeUndefined();
    expect(v1TokenList.headers.sunset).toBeUndefined();
    expect(v1TokenList.headers.link).toBeUndefined();
    expect(lines.slice(humanLogAt).join('\n')).not.toContain('"tokenId"');

    const aliasTokenList = await app.inject({
      method: 'GET',
      url: '/api/auth/tokens',
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(aliasTokenList.statusCode).toBe(200);
    expect(aliasTokenList.json().tokens[0].id).toBe(token.id);
    expect(aliasTokenList.headers.deprecation).toBeUndefined();
    expect(aliasTokenList.headers.sunset).toBeUndefined();
    expect(aliasTokenList.headers.link).toBe('</api/v1/auth/tokens>; rel="successor-version"');

    const created = await app.inject({
      method: 'POST',
      url: '/api/auth/tokens',
      payload: { name: 'Created' },
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(created.statusCode).toBe(201);
    expect(created.headers.deprecation).toBeUndefined();
    expect(created.headers.sunset).toBeUndefined();
    expect(created.headers.link).toBeUndefined();

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/auth/tokens/${token.id}`,
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(removed.headers.deprecation).toBeUndefined();
    expect(removed.headers.sunset).toBeUndefined();
    expect(removed.headers.link).toBeUndefined();

    const versionedCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/tokens',
      payload: { name: 'Created' },
      headers: { authorization: `Bearer ${bearer}` },
    });
    const versionedDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/auth/tokens/${token.id}`,
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(versionedCreate.statusCode).toBe(404);
    expect(versionedDelete.statusCode).toBe(404);

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(404);
    expect(health.headers.deprecation).toBeUndefined();
    expect(health.headers.sunset).toBeUndefined();
    expect(health.headers.link).toBeUndefined();

    const processed = await app.inject({
      method: 'POST',
      url: `/api/captures/${captureView.id}/process`,
      payload: { type: 'task', data: { title: 'Twice' } },
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(processed.statusCode).toBe(400);
    expect(processed.json()).toEqual({ message: 'Capture must be in inbox to be processed' });

    const agentCall = await app.inject({
      method: 'POST',
      url: '/api/v1/captures',
      payload: { content: 'Hello' },
      headers: { authorization: `Bearer ${agentToken.id}:agent-token` },
    });
    expect(agentCall.statusCode).toBe(403);
    const log = lines.join('\n');
    expect(log).toContain('"apiVersion":"v1"');
    expect(log).toContain('"alias":false');
    expect(log).toContain('"alias":true');
    expect(log).toContain(`"tokenId":"${agentToken.id}"`);
    expect(log).not.toContain('valid-token');
    expect(log).not.toContain('agent-token');
    await app.close();
  });

  it('sets Deprecation and Sunset only for an explicit window of at least 90 days', async () => {
    const deprecation = new Date('2026-01-01T00:00:00.000Z');
    const sunset = new Date(deprecation.getTime() + PUBLIC_API_ALIAS_MIN_WINDOW_MS);
    const short = new Date(deprecation.getTime() + PUBLIC_API_ALIAS_MIN_WINDOW_MS - 1);
    const orgId = '550e8400-e29b-41d4-a716-446655440001';
    const userId = '550e8400-e29b-41d4-a716-446655440002';
    const token: ApiToken = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      userId,
      organizationId: orgId,
      tokenHash: 'fake-hash:valid-token',
      name: 'test-token',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    const tokenService = createTokenService({
      organizationStore: createFakeOrganizationStore({
        initialOrganizations: [{ id: orgId, name: 'Test Org', createdAt: '2024-01-01T00:00:00.000Z' }],
      }),
      userStore: createFakeUserStore({
        initialUsers: [{ id: userId, email: 'test@example.com', createdAt: '2024-01-01T00:00:00.000Z' }],
      }),
      tokenStore: createFakeTokenStore({ initialTokens: [token] }),
      passwordHasher: createFakePasswordHasher(),
      clock,
    });
    const deps = stub<PublicApiV1Dependencies>();
    deps.tokenAuth = createAuthMiddleware({ tokenService });
    deps.aliasAuth = deps.tokenAuth;
    deps.tokenHandlers = stub<TokenHandlers>();
    deps.tokenHandlers.list = () => okAsync({ tokens: [] });
    await expect(
      registerPublicApiV1(Fastify(), { ...deps, aliasRetirement: { deprecation, sunset: short } }),
    ).rejects.toThrow(/90-day minimum/);

    const app = Fastify();
    await registerPublicApiV1(app, { ...deps, aliasRetirement: { deprecation, sunset } });
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/tokens',
      headers: { authorization: `Bearer ${token.id}:valid-token` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers.deprecation).toBe('Thu, 01 Jan 2026 00:00:00 GMT');
    expect(response.headers.sunset).toBe('Wed, 01 Apr 2026 00:00:00 GMT');
    expect(response.headers.link).toBe('</api/v1/auth/tokens>; rel="successor-version"');
    const versioned = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/tokens',
      headers: { authorization: `Bearer ${token.id}:valid-token` },
    });
    expect(versioned.headers.deprecation).toBeUndefined();
    expect(versioned.headers.sunset).toBeUndefined();
    await app.close();
  });
});
