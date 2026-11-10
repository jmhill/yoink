import cookie from '@fastify/cookie';
import type { NowNextActionItem, Task } from '@yoink/api-contracts';
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
import type { WorkHandlers } from '../modules/task-management/index.js';
import {
  registerPublicApiV1,
  type PublicApiV1Dependencies,
} from '../edges/public-api/v1/index.js';
import { registerWebApi } from '../edges/web/index.js';

const stub = <T extends object>(): T =>
  new Proxy({} as T, {
    get: (target, prop, receiver) => {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
      return () => {
        throw new Error(`unexpected ${String(prop)}`);
      };
    },
  });

describe('web API work', () => {
  it('arranges task-management pages on /web-api and keeps /api and /api/v1', async () => {
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
    const lane: User = {
      id: '550e8400-e29b-41d4-a716-446655440099',
      email: 'lane@example.com',
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
    const membership: OrganizationMembership = {
      id: '550e8400-e29b-41d4-a716-446655440010',
      userId: user.id,
      organizationId: org.id,
      role: 'admin',
      isPersonalOrg: true,
      joinedAt: '2024-01-01T00:00:00.000Z',
    };
    const laneMembership: OrganizationMembership = {
      id: '550e8400-e29b-41d4-a716-446655440011',
      userId: lane.id,
      organizationId: org.id,
      role: 'member',
      isPersonalOrg: false,
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
    const task = (id: string, title: string, dueDate?: string, assigneeId?: string): Task => ({
      id,
      organizationId: org.id,
      createdById: user.id,
      title,
      createdAt: '2024-06-15T12:00:00.000Z',
      lastChangedAt: null,
      lastChangedBy: null,
      completedBy: null,
      ...(dueDate === undefined ? {} : { dueDate }),
      ...(assigneeId === undefined ? {} : { assigneeId }),
    });
    const next = (
      id: string,
      title: string,
      projectName: string,
      projectId: string,
      dueDate?: string,
      assigneeId?: string
    ): NowNextActionItem => ({
      task: task(id, title, dueDate, assigneeId),
      project: { id: projectId, name: projectName },
    });

    const mango = task('550e8400-e29b-41d4-a716-446655440021', 'Mango', '2020-01-02', lane.id);
    const banana = task('550e8400-e29b-41d4-a716-446655440022', 'Banana', '2020-01-01', user.id);
    const zebra = next(
      '550e8400-e29b-41d4-a716-446655440023',
      'Zebra',
      'Zebra',
      '550e8400-e29b-41d4-a716-446655440031',
      undefined,
      user.id
    );
    const dated = next(
      '550e8400-e29b-41d4-a716-446655440024',
      'Dated next',
      'Middle',
      '550e8400-e29b-41d4-a716-446655440032',
      '2020-01-03'
    );
    const apple = next(
      '550e8400-e29b-41d4-a716-446655440025',
      'Apple',
      'Apple',
      '550e8400-e29b-41d4-a716-446655440033',
      undefined,
      lane.id
    );

    const seen: { next?: { limit?: number; cursor?: string; owner?: string }; due?: { limit?: number; cursor?: string } } = {};
    const workHandlers = stub<WorkHandlers>();
    workHandlers.listNextActions = (query) => {
      seen.next = { limit: query.limit, cursor: query.cursor, owner: query.owner };
      return okAsync({
        items: [zebra, dated, apple],
        hasMore: false,
        nextCursor: null,
        total: 7,
      });
    };
    workHandlers.listDue = (query) => {
      seen.due = { limit: query.limit, cursor: query.cursor };
      return okAsync({
        items: [mango, banana],
        hasMore: false,
        nextCursor: null,
        total: 4,
      });
    };
    workHandlers.listLists = () =>
      okAsync({
        items: [
          {
            id: '550e8400-e29b-41d4-a716-446655440041',
            name: 'Weekend',
            createdAt: '2024-06-15T12:00:00.000Z',
            openTaskCount: 2,
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440042',
            name: 'Groceries',
            createdAt: '2024-06-15T12:00:00.000Z',
            openTaskCount: 1,
          },
        ],
        hasMore: false,
        nextCursor: null,
        total: 2,
        unlisted: { openTaskCount: 4 },
      });

    const clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    const organizationStore = createFakeOrganizationStore({ initialOrganizations: [org] });
    const userStore = createFakeUserStore({ initialUsers: [user, lane] });
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
      membershipStore: createFakeOrganizationMembershipStore({
        initialMemberships: [membership, laneMembership],
      }),
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
    const combinedAuth = createCombinedAuthMiddleware(
      combinedAuthFromServices({
        tokenService,
        sessionService,
        sessionCookieName: USER_SESSION_COOKIE,
      })
    );
    const app = Fastify();
    await app.register(cookie);
    const deps = stub<PublicApiV1Dependencies>();
    deps.captures = stub<Captures>();
    deps.workHandlers = workHandlers;
    deps.tokenAuth = createAuthMiddleware({
      authenticateToken: authenticateTokenWith(tokenService),
    });
    deps.aliasAuth = combinedAuth;
    deps.aliasRetirement = undefined;
    deps.tokenHandlers = undefined;
    await registerPublicApiV1(app, deps);
    await registerWebApi(app, {
      captures: deps.captures,
      combinedAuth,
      work: { workHandlers, membershipService, userService },
    });

    const bearer = { authorization: `Bearer ${token.id}:valid-token` };
    const sessionCookie = { [USER_SESSION_COOKIE]: session.id };

    const web = await app.inject({
      method: 'GET',
      url: '/web-api/work?limit=10',
      cookies: sessionCookie,
    });
    expect(web.statusCode).toBe(200);
    expect(web.headers.deprecation).toBeUndefined();
    expect(web.headers.sunset).toBeUndefined();
    expect(seen.next).toEqual({ limit: 10, cursor: undefined, owner: 'all' });
    expect(seen.due).toEqual({ limit: 10, cursor: undefined });

    const body = web.json<{
      nextActionCount: number;
      dueCount: number;
      sections: Array<{
        name: string;
        rows: Array<{
          task: { title: string };
          projectLabel?: string;
          ownerLabel?: string;
          source: string;
        }>;
      }>;
    }>();
    expect(body.nextActionCount).toBe(7);
    expect(body.dueCount).toBe(4);
    expect(body.sections.map((section) => section.name)).toEqual(['due', 'next-actions']);
    const due = body.sections[0];
    const nextActions = body.sections[1];
    expect(due?.rows.map((row) => row.task.title)).toEqual(['Mango', 'Banana', 'Dated next']);
    expect(due?.rows.map((row) => row.ownerLabel ?? null)).toEqual(['Lane', null, null]);
    expect(due?.rows.map((row) => row.source)).toEqual(['due', 'due', 'next-action']);
    expect(due?.rows[2]?.projectLabel).toBe('Middle');
    expect(nextActions?.rows.map((row) => [row.task.title, row.projectLabel, row.ownerLabel ?? null])).toEqual([
      ['Zebra', 'Zebra', null],
      ['Apple', 'Apple', 'Lane'],
    ]);

    const titlesOf = (payload: { items?: Array<{ task: { title: string } }> }): string[] =>
      (payload.items ?? []).map((item) => item.task.title);
    const aliasNext = await app.inject({
      method: 'GET',
      url: '/api/work/next-actions?limit=10',
      headers: bearer,
    });
    expect(aliasNext.statusCode).toBe(200);
    expect(titlesOf(aliasNext.json())).toEqual(['Zebra', 'Dated next', 'Apple']);
    const v1Next = await app.inject({
      method: 'GET',
      url: '/api/v1/work/next-actions?limit=10',
      headers: bearer,
    });
    expect(v1Next.statusCode).toBe(200);
    expect(titlesOf(v1Next.json())).toEqual(['Zebra', 'Dated next', 'Apple']);

    const listNames = (payload: { lists?: Array<{ name: string }> }): string[] =>
      (payload.lists ?? []).map((list) => list.name);
    const webLists = await app.inject({
      method: 'GET',
      url: '/web-api/work/lists?limit=10',
      cookies: sessionCookie,
    });
    expect(webLists.statusCode).toBe(200);
    expect(listNames(webLists.json())).toEqual(['Weekend', 'Groceries']);
    expect(webLists.json().unlisted.openTaskCount).toBe(4);
    const aliasLists = await app.inject({
      method: 'GET',
      url: '/api/work/lists?limit=10',
      headers: bearer,
    });
    expect(aliasLists.statusCode).toBe(200);
    expect(listNames(aliasLists.json())).toEqual(['Weekend', 'Groceries']);
    const v1Lists = await app.inject({
      method: 'GET',
      url: '/api/v1/work/lists?limit=10',
      headers: bearer,
    });
    expect(v1Lists.statusCode).toBe(200);
    expect(listNames(v1Lists.json())).toEqual(['Weekend', 'Groceries']);

    const webOwner = await app.inject({
      method: 'GET',
      url: '/web-api/work?owner=bogus',
      cookies: sessionCookie,
    });
    const aliasOwner = await app.inject({
      method: 'GET',
      url: '/api/work/next-actions?owner=bogus',
      headers: bearer,
    });
    expect(webOwner.statusCode).toBe(400);
    expect(webOwner.json()).toEqual(aliasOwner.json());
    expect(webOwner.json()).toEqual({
      message: 'Request validation failed: owner',
      code: 'VALIDATION_FAILED',
      fields: ['owner'],
    });

    const webZone = await app.inject({
      method: 'GET',
      url: '/web-api/work?timeZone=Mars/Base',
      cookies: sessionCookie,
    });
    const aliasZone = await app.inject({
      method: 'GET',
      url: '/api/work/due?timeZone=Mars/Base',
      headers: bearer,
    });
    expect(webZone.statusCode).toBe(400);
    expect(webZone.json()).toEqual(aliasZone.json());
    expect(webZone.json()).toEqual({
      message: 'Invalid IANA time zone',
      code: 'INVALID_TIME_ZONE',
    });
  });
});
