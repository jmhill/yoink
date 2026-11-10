import cookie from '@fastify/cookie';
import {
  createFakeClock,
  createFakeIdGenerator,
  createFakePasswordHasher,
} from '@yoink/infrastructure';
import Fastify from 'fastify';
import { okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import type { ApiToken } from '../access/domain/api-token.js';
import type { OrganizationMembership } from '../access/domain/organization-membership.js';
import type { Organization } from '../access/domain/organization.js';
import { createMembershipService } from '../access/application/handle-membership.js';
import { createSessionService } from '../access/application/handle-session.js';
import { createTokenService } from '../access/application/handle-token.js';
import type { UserSession } from '../access/domain/user-session.js';
import type { User } from '../access/domain/user.js';
import { createUserService } from '../access/domain/user-service.js';
import { authenticateTokenWith } from '../access/application/authenticate-principal.js';
import { createAuthMiddleware } from '../edges/_shared/auth/auth-middleware.js';
import { combinedAuthFromServices } from '../edges/_shared/auth/auth-from-services.js';
import {
  createCombinedAuthMiddleware,
  USER_SESSION_COOKIE,
} from '../edges/_shared/auth/combined-auth-middleware.js';
import { createFakeOrganizationMembershipStore } from '../access/infrastructure/fake-organization-membership-store.js';
import { createFakeOrganizationStore } from '../access/infrastructure/fake-organization-store.js';
import { createFakeTokenStore } from '../access/infrastructure/fake-token-store.js';
import { createFakeUserSessionStore } from '../access/infrastructure/fake-user-session-store.js';
import { createFakeUserStore } from '../access/infrastructure/fake-user-store.js';
import type { Captures } from '../modules/captures/index.js';
import {
  registerPublicApiV1,
  type PublicApiV1Dependencies,
} from '../edges/public-api/v1/index.js';
import {
  EXTENSION_VERSION_HEADER,
  registerExtensionApiV1,
} from '../edges/extension/v1/index.js';

const stub = <T extends object>(): T =>
  new Proxy({} as T, {
    get: (target, prop, receiver) => {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
      return () => {
        throw new Error(`unexpected ${String(prop)}`);
      };
    },
  });

describe('extension API v1', () => {
  it('accepts a token on POST /api/captures and POST /extension-api/v1/captures', async () => {
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
    const captures = stub<Captures>();
    captures.commands = stub<Captures['commands']>();
    captures.queries = stub<Captures['queries']>();
    captures.commands.createCapture = () =>
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
    captures.queries.listCaptures = () =>
      okAsync({ items: [], hasMore: false, nextCursor: null, total: 0 });
    const lines: string[] = [];
    const app = Fastify({
      logger: { level: 'info', stream: { write: (message: string) => lines.push(message) } },
    });
    await app.register(cookie);
    const tokenAuth = createAuthMiddleware({
      authenticateToken: authenticateTokenWith(tokenService),
    });
    const deps = stub<PublicApiV1Dependencies>();
    deps.captures = captures;
    deps.tokenAuth = tokenAuth;
    deps.aliasRetirement = undefined;
    deps.tokenHandlers = undefined;
    deps.aliasAuth = createCombinedAuthMiddleware(
      combinedAuthFromServices({
        tokenService,
        sessionService,
        sessionCookieName: USER_SESSION_COOKIE,
      })
    );
    await registerPublicApiV1(app, deps);
    await registerExtensionApiV1(app, { captures, tokenAuth });

    const bearer = `${token.id}:valid-token`;
    const oldPath = await app.inject({
      method: 'POST',
      url: '/api/captures',
      payload: { content: 'Hello', sourceApp: 'browser-extension' },
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(oldPath.statusCode).toBe(201);
    expect(oldPath.json()).toMatchObject({ id: captureView.id, content: 'Hello' });
    expect(oldPath.headers.deprecation).toBeUndefined();
    expect(oldPath.headers.sunset).toBeUndefined();
    expect(oldPath.headers.link).toBe('</api/v1/captures>; rel="successor-version"');

    const before = lines.length;
    const extensionPath = await app.inject({
      method: 'POST',
      url: '/extension-api/v1/captures',
      payload: { content: 'Hello', sourceApp: 'browser-extension' },
      headers: {
        authorization: `Bearer ${bearer}`,
        [EXTENSION_VERSION_HEADER]: '1.0.2',
      },
    });
    expect(extensionPath.statusCode).toBe(201);
    expect(extensionPath.json()).toEqual(oldPath.json());
    expect(extensionPath.headers.deprecation).toBeUndefined();
    expect(extensionPath.headers.sunset).toBeUndefined();
    expect(extensionPath.headers.link).toBeUndefined();
    expect(lines.slice(before).join('\n')).toContain('"extensionVersion":"1.0.2"');
    expect(lines.slice(before).join('\n')).not.toContain('valid-token');

    const listed = await app.inject({
      method: 'GET',
      url: '/extension-api/v1/captures?limit=1',
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({ captures: [], hasMore: false, nextCursor: null, total: 0 });
    expect(lines.join('\n')).toContain('"extensionVersion":"absent"');

    const sessionOnly = await app.inject({
      method: 'POST',
      url: '/extension-api/v1/captures',
      payload: { content: 'Hello' },
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(sessionOnly.statusCode).toBe(401);
    expect(sessionOnly.json()).toEqual({ message: 'Missing authorization header' });

    const notOnThisEdge = await app.inject({
      method: 'POST',
      url: `/extension-api/v1/captures/${captureView.id}/process`,
      payload: { type: 'task', data: {} },
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(notOnThisEdge.statusCode).toBe(404);

    const agentCall = await app.inject({
      method: 'POST',
      url: '/extension-api/v1/captures',
      payload: { content: 'Hello' },
      headers: { authorization: `Bearer ${agentToken.id}:agent-token` },
    });
    expect(agentCall.statusCode).toBe(403);
    expect(agentCall.json()).toEqual({ message: 'Agents cannot create captures' });
    expect(lines.join('\n')).toContain(`"tokenId":"${agentToken.id}"`);
    expect(lines.join('\n')).not.toContain('agent-token');
    await app.close();
  });
});
