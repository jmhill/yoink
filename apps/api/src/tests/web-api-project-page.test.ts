import cookie from '@fastify/cookie';
import type { Project, StagedImport, Task } from '@yoink/api-contracts';
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
import { createSessionService } from '../access/domain/session-service.js';
import { createTokenService } from '../access/domain/token-service.js';
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

describe('web API project page', () => {
  it('returns task-management order on /web-api and keeps /api and /api/v1', async () => {
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
    const harbor: Project = {
      id: projectId,
      organizationId: org.id,
      name: 'Harbor',
      status: 'active',
      waitingOn: null,
      waitingSince: null,
      nextActionTaskId: null,
      notebookPages: [],
      createdById: user.id,
      createdAt: '2024-06-15T12:00:00.000Z',
      lastChangedAt: null,
      lastChangedBy: null,
    };
    const task = (id: string, title: string): Task => ({
      id,
      organizationId: org.id,
      createdById: user.id,
      title,
      createdAt: '2024-06-15T12:00:00.000Z',
      lastChangedAt: '2024-06-15T12:00:00.000Z',
      lastChangedBy: user.id,
      completedBy: null,
    });
    const zebra = task('550e8400-e29b-41d4-a716-446655440021', 'Zebra');
    const apple = task('550e8400-e29b-41d4-a716-446655440022', 'Apple');
    const page = { items: [zebra, apple], hasMore: false, nextCursor: null, total: 2 };
    const staged = (id: string, name: string): StagedImport => ({
      id,
      status: 'pending',
      createdById: user.id,
      createdByName: name,
      createdAt: '2024-06-15T12:00:00.000Z',
      decidedById: null,
      decidedAt: null,
      preview: null,
      errors: [],
    });
    const zebraImport = staged('550e8400-e29b-41d4-a716-446655440051', 'Zebra');
    const appleImport = staged('550e8400-e29b-41d4-a716-446655440052', 'Apple');
    const projectHandlers = stub<ProjectHandlers>();
    projectHandlers.get = () => okAsync(harbor);
    projectHandlers.listOpenTasks = () => okAsync(page);
    projectHandlers.listImports = () => okAsync({ imports: [zebraImport, appleImport] });

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
    deps.projectHandlers = projectHandlers;
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
      projectPage: { projectHandlers },
    });

    const bearer = { authorization: `Bearer ${token.id}:valid-token` };
    const sessionCookie = { [USER_SESSION_COOKIE]: session.id };
    const ordered = ['Zebra', 'Apple'];

    const webTasks = await app.inject({
      method: 'GET',
      url: `/web-api/projects/${projectId}/tasks?limit=10`,
      cookies: sessionCookie,
    });
    expect(webTasks.statusCode).toBe(200);
    expect(titles(webTasks.json())).toEqual(ordered);
    expect(webTasks.headers.deprecation).toBeUndefined();
    expect(webTasks.headers.sunset).toBeUndefined();

    const aliasTasks = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/tasks?limit=10`,
      headers: bearer,
    });
    expect(aliasTasks.statusCode).toBe(200);
    expect(titles(aliasTasks.json())).toEqual(ordered);

    const v1Tasks = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tasks?limit=10`,
      headers: bearer,
    });
    expect(v1Tasks.statusCode).toBe(200);
    expect(titles(v1Tasks.json())).toEqual(ordered);

    const webProject = await app.inject({
      method: 'GET',
      url: `/web-api/projects/${projectId}`,
      cookies: sessionCookie,
    });
    expect(webProject.statusCode).toBe(200);
    expect(webProject.json().name).toBe('Harbor');

    const aliasProject = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}`,
      headers: bearer,
    });
    expect(aliasProject.statusCode).toBe(200);
    expect(aliasProject.json().name).toBe('Harbor');

    const webImports = await app.inject({
      method: 'GET',
      url: '/web-api/projects/imports',
      cookies: sessionCookie,
    });
    expect(webImports.statusCode).toBe(200);
    expect(webImports.json().imports.map((item: { createdByName: string }) => item.createdByName)).toEqual(
      ordered
    );

    const aliasImports = await app.inject({
      method: 'GET',
      url: '/api/projects/imports',
      headers: bearer,
    });
    expect(aliasImports.statusCode).toBe(200);
    expect(
      aliasImports.json().imports.map((item: { createdByName: string }) => item.createdByName)
    ).toEqual(ordered);

    await app.close();
  });
});
