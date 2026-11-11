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
import type { OrganizationMembership } from '../access/domain/organization-membership.js';
import type { Organization } from '../access/domain/organization.js';
import { createMembershipService } from '../access/application/handle-membership.js';
import { createSessionService } from '../access/application/handle-session.js';
import { createTokenService } from '../access/application/handle-token.js';
import type { UserSession } from '../access/domain/user-session.js';
import type { User } from '../access/domain/user.js';
import { createUserService } from '../access/application/handle-user.js';
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
import { invalidCursorError } from '../kernel/listing/domain/invalid-cursor.js';
import type { Captures } from '../modules/captures/index.js';
import type { HistoryHandlers, HistoryPage, ListedTask } from '../modules/history/index.js';
import { projectNotFoundError } from '../modules/task-management/domain/messages/project-errors.js';
import type { ProjectHandlers } from '../modules/task-management/index.js';
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

const titles = (body: { tasks?: Array<{ title: string }> }): string[] =>
  (body.tasks ?? []).map((task) => task.title);

describe('web API history', () => {
  it('serves project history and finished tasks on /web-api and keeps /api and /api/v1', async () => {
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
    const projectId = '550e8400-e29b-41d4-a716-446655440041';
    const historyPage: HistoryPage = {
      entries: [
        {
          id: '550e8400-e29b-41d4-a716-446655440090',
          kind: 'ProjectCreated',
          occurredAt: '2026-10-11T00:00:00.000Z',
          actor: { userId: user.id, kind: 'user', name: 'Justin' },
          subject: { type: 'project', id: projectId, title: 'Harbor', deleted: false },
          details: { kind: 'ProjectCreated', name: 'Harbor' },
        },
      ],
      hasMore: false,
      nextCursor: null,
      total: 1,
      historyStartsAt: '2026-10-10T13:56:00.000Z',
    };
    const finished = (id: string, title: string): ListedTask => ({
      id,
      organizationId: org.id,
      createdById: user.id,
      title,
      createdAt: '2024-06-15T12:00:00.000Z',
      lastChangedAt: '2024-06-15T12:00:00.000Z',
      lastChangedBy: user.id,
      completedBy: user.id,
      completedAt: '2024-06-16T12:00:00.000Z',
      projectId,
    });
    const zebra = finished('550e8400-e29b-41d4-a716-446655440021', 'Zebra');
    const apple = finished('550e8400-e29b-41d4-a716-446655440022', 'Apple');
    const finishedPage = {
      items: [zebra, apple],
      hasMore: false,
      nextCursor: null,
      total: 2,
    };
    const historyHandlers = stub<HistoryHandlers>();
    historyHandlers.listProjectHistory = () => okAsync(historyPage);
    historyHandlers.listFinishedTasks = () => okAsync(finishedPage);

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
    deps.projectHandlers = stub<ProjectHandlers>();
    deps.historyHandlers = historyHandlers;
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
      history: { historyHandlers },
    });

    const bearer = { authorization: `Bearer ${token.id}:valid-token` };
    const sessionCookie = { [USER_SESSION_COOKIE]: session.id };

    const webHistory = await app.inject({
      method: 'GET',
      url: `/web-api/projects/${projectId}/history?limit=10`,
      cookies: sessionCookie,
    });
    expect(webHistory.statusCode).toBe(200);
    expect(webHistory.json()).toMatchObject({
      total: 1,
      historyStartsAt: '2026-10-10T13:56:00.000Z',
      entries: [{ kind: 'ProjectCreated', details: { kind: 'ProjectCreated', name: 'Harbor' } }],
    });
    expect(webHistory.headers.deprecation).toBeUndefined();
    expect(webHistory.headers.sunset).toBeUndefined();

    const aliasHistory = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/history?limit=10`,
      headers: bearer,
    });
    expect(aliasHistory.statusCode).toBe(200);
    expect(aliasHistory.json()).toEqual(webHistory.json());

    const v1History = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/history?limit=10`,
      headers: bearer,
    });
    expect(v1History.statusCode).toBe(200);
    expect(v1History.json()).toEqual(webHistory.json());

    const webFinished = await app.inject({
      method: 'GET',
      url: `/web-api/projects/${projectId}/finished?limit=10`,
      cookies: sessionCookie,
    });
    expect(webFinished.statusCode).toBe(200);
    expect(titles(webFinished.json())).toEqual(['Zebra', 'Apple']);

    const aliasFinished = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/tasks?status=finished&limit=10`,
      headers: bearer,
    });
    expect(aliasFinished.statusCode).toBe(200);
    expect(aliasFinished.json()).toEqual(webFinished.json());

    historyHandlers.listProjectHistory = () => errAsync(invalidCursorError());
    const webCursor = await app.inject({
      method: 'GET',
      url: `/web-api/projects/${projectId}/history?cursor=not-a-cursor`,
      cookies: sessionCookie,
    });
    const aliasCursor = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/history?cursor=not-a-cursor`,
      headers: bearer,
    });
    expect(webCursor.statusCode).toBe(400);
    expect(webCursor.json()).toEqual({ message: 'Cursor is invalid', code: 'invalid_cursor' });
    expect(aliasCursor.json()).toEqual(webCursor.json());

    historyHandlers.listFinishedTasks = () => errAsync(projectNotFoundError(projectId));
    const webMissing = await app.inject({
      method: 'GET',
      url: `/web-api/projects/${projectId}/finished`,
      cookies: sessionCookie,
    });
    const aliasMissing = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/tasks?status=finished`,
      headers: bearer,
    });
    expect(webMissing.statusCode).toBe(404);
    expect(webMissing.json()).toEqual({ message: 'Project not found', code: 'PROJECT_NOT_FOUND' });
    expect(aliasMissing.statusCode).toBe(404);
    expect(aliasMissing.json()).toEqual(webMissing.json());
  });
});
