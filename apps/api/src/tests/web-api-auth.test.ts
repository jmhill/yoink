import cookie from '@fastify/cookie';
import {
  createFakeClock,
  createFakeIdGenerator,
  createFakePasswordHasher,
} from '@yoink/infrastructure';
import Fastify from 'fastify';
import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import type { ApiToken } from '../access/domain/api-token.js';
import { credentialNotFoundError } from '../access/domain/auth-errors.js';
import type { OrganizationMembership } from '../access/domain/organization-membership.js';
import type { Organization } from '../access/domain/organization.js';
import { createMembershipService } from '../access/application/handle-membership.js';
import type { AuthenticationOptions } from '../access/application/handle-passkey.js';
import { createSessionService } from '../access/application/handle-session.js';
import { createTokenService } from '../access/application/handle-token.js';
import type { UserSession } from '../access/domain/user-session.js';
import type { User } from '../access/domain/user.js';
import { createUserService } from '../access/application/handle-user.js';
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
import {
  registerWebApi,
  YOINK_BUILD_HEADER,
  type WebAuthDependencies,
  type WebSettingsDependencies,
} from '../edges/web/index.js';
import type { RateLimitConfig } from '../platform/config/schema.js';

const stub = <T extends object>(): T =>
  new Proxy({} as T, {
    get: (target, prop, receiver) => {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
      return () => {
        throw new Error(`unexpected ${String(prop)}`);
      };
    },
  });

const disabledRateLimit: RateLimitConfig = {
  enabled: false,
  globalMax: 100,
  globalTimeWindow: '1 minute',
  ipMax: 2000,
  adminLoginMax: 5,
  adminLoginTimeWindow: '15 minutes',
  authLoginMax: 10,
  authLoginTimeWindow: '15 minutes',
  signupMax: 5,
  signupTimeWindow: '1 hour',
};

describe('web API auth', () => {
  it('serves session, login, and passkeys on /web-api and keeps token list metadata-only', async () => {
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
    settings.tokenHandlers = stub<WebSettingsDependencies['tokenHandlers']>();
    settings.tokenHandlers.list = () => okAsync({ tokens: [] });
    const auth = stub<WebAuthDependencies>();
    auth.passkeyService = stub<WebAuthDependencies['passkeyService']>();
    auth.passkeyService.generateAuthenticationOptions = () =>
      okAsync({
        options: { challenge: 'raw' },
        challenge: 'signed-challenge',
      } as AuthenticationOptions);
    auth.passkeyService.verifyAuthentication = () =>
      errAsync(credentialNotFoundError('missing'));
    auth.passkeyService.listCredentials = () => okAsync([]);
    auth.sessionService = sessionService;
    auth.userService = userService;
    auth.membershipService = membershipService;
    auth.organizationStore = organizationStore;
    auth.sessionCookieName = USER_SESSION_COOKIE;
    auth.cookieOptions = {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
      maxAge: 60,
    };
    auth.clientIpOf = () => '127.0.0.1';
    auth.rateLimit = disabledRateLimit;
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
    await registerWebApi(app, { captures, combinedAuth, settings, auth });

    const anonymous = await app.inject({
      method: 'GET',
      url: '/web-api/auth/session',
    });
    expect(anonymous.statusCode).toBe(401);

    const alias = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(alias.statusCode).toBe(404);

    const before = lines.length;
    const current = await app.inject({
      method: 'GET',
      url: '/web-api/auth/session',
      cookies: { [USER_SESSION_COOKIE]: session.id },
      headers: { [YOINK_BUILD_HEADER]: 'auth-build' },
    });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toEqual({
      user: { id: user.id, email: user.email },
      organizationId: org.id,
      organizations: [
        {
          id: org.id,
          name: org.name,
          isPersonal: true,
          role: 'owner',
        },
      ],
    });
    expect(lines.slice(before).join('\n')).toContain('"buildId":"auth-build"');

    const options = await app.inject({
      method: 'POST',
      url: '/web-api/auth/login/options',
      payload: {},
    });
    expect(options.statusCode).toBe(200);
    expect(options.json()).toEqual({
      options: { challenge: 'raw' },
      challenge: 'signed-challenge',
    });

    const verify = await app.inject({
      method: 'POST',
      url: '/web-api/auth/login/verify',
      payload: { challenge: 'signed-challenge', credential: { id: 'missing' } },
    });
    expect(verify.statusCode).toBe(401);
    expect(verify.json()).toEqual({ message: 'Passkey not recognized' });

    const passkeys = await app.inject({
      method: 'GET',
      url: '/web-api/auth/passkey/credentials',
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(passkeys.statusCode).toBe(200);
    expect(passkeys.json()).toEqual({ credentials: [] });

    const tokens = await app.inject({
      method: 'GET',
      url: '/web-api/auth/tokens',
      cookies: { [USER_SESSION_COOKIE]: session.id },
    });
    expect(tokens.statusCode).toBe(200);
    expect(tokens.json()).toEqual({ tokens: [] });
  });
});
