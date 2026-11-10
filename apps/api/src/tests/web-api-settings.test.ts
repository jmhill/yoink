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
import { createFakeOrganizationMembershipStore } from '../access/infrastructure/fake-organization-membership-store.js';
import { createFakeOrganizationStore } from '../access/infrastructure/fake-organization-store.js';
import { createFakeTokenStore } from '../access/infrastructure/fake-token-store.js';
import { createFakeUserSessionStore } from '../access/infrastructure/fake-user-session-store.js';
import { createFakeUserStore } from '../access/infrastructure/fake-user-store.js';
import { combinedAuthFromServices } from '../edges/_shared/auth/auth-from-services.js';
import {
  createCombinedAuthMiddleware,
  USER_SESSION_COOKIE,
} from '../edges/_shared/auth/combined-auth-middleware.js';
import type { Captures } from '../modules/captures/index.js';
import { registerWebApi, YOINK_BUILD_HEADER, type WebSettingsDependencies } from '../edges/web/index.js';

const stub = <T extends object>(): T =>
  new Proxy({} as T, {
    get: (target, prop, receiver) => {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
      return () => {
        throw new Error(`unexpected ${String(prop)}`);
      };
    },
  });

describe('web API settings', () => {
  it('serves members, switch, and tokens on /web-api and leaves passkeys unmounted', async () => {
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
    const token: ApiToken = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      userId: user.id,
      organizationId: org.id,
      tokenHash: 'fake-hash:valid-token',
      name: 'test-token',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const membership: OrganizationMembership = {
      id: '550e8400-e29b-41d4-a716-446655440010',
      userId: user.id,
      organizationId: org.id,
      role: 'owner',
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
    const userStore = createFakeUserStore({ initialUsers: [user] });
    const tokenStore = createFakeTokenStore({ initialTokens: [token] });
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
    const captures = stub<Captures>();
    captures.commands = stub<Captures['commands']>();
    captures.queries = stub<Captures['queries']>();
    const settings = stub<WebSettingsDependencies>();
    settings.sessionService = sessionService;
    settings.membershipService = membershipService;
    settings.userService = userService;
    settings.tokenHandlers = stub<WebSettingsDependencies['tokenHandlers']>();
    settings.tokenHandlers.list = () => okAsync({ tokens: [] });
    settings.removeMember = () => okAsync(undefined);
    const lines: string[] = [];
    const app = Fastify({
      logger: { level: 'info', stream: { write: (message: string) => lines.push(message) } },
    });
    await app.register(cookie);
    const combinedAuth = createCombinedAuthMiddleware(
      combinedAuthFromServices({
        tokenService,
        sessionService,
        sessionCookieName: USER_SESSION_COOKIE,
      })
    );
    await registerWebApi(app, { captures, combinedAuth, settings });

    const before = lines.length;
    const members = await app.inject({
      method: 'GET',
      url: `/web-api/organizations/${org.id}/members`,
      cookies: { [USER_SESSION_COOKIE]: session.id },
      headers: { [YOINK_BUILD_HEADER]: 'settings-build' },
    });
    expect(members.statusCode).toBe(200);
    expect(members.json()).toEqual({
      members: [
        {
          userId: user.id,
          email: user.email,
          kind: 'human',
          role: 'owner',
          joinedAt: membership.joinedAt,
        },
      ],
    });
    expect(lines.slice(before).join('\n')).toContain('"buildId":"settings-build"');

    const switched = await app.inject({
      method: 'POST',
      url: '/web-api/organizations/switch',
      payload: { organizationId: '550e8400-e29b-41d4-a716-446655440099' },
      headers: { authorization: `Bearer ${token.id}:valid-token` },
    });
    expect(switched.statusCode).toBe(400);
    expect(switched.json()).toEqual({
      message: 'Organization switching requires session authentication (not token)',
    });

    const removed = await app.inject({
      method: 'DELETE',
      url: `/web-api/organizations/${org.id}/members/550e8400-e29b-41d4-a716-446655440088`,
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(removed.statusCode).toBe(204);

    const tokens = await app.inject({
      method: 'GET',
      url: '/web-api/auth/tokens',
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(tokens.statusCode).toBe(200);
    expect(tokens.json()).toEqual({ tokens: [] });

    const passkeys = await app.inject({
      method: 'GET',
      url: '/web-api/auth/passkey/credentials',
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(passkeys.statusCode).toBe(404);
  });
});
