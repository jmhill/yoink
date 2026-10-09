import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { registerOrganizationRoutes } from './organization-routes.js';
import { createSessionService } from '../domain/session-service.js';
import { createUserService } from '../domain/user-service.js';
import { createMembershipService } from '../domain/membership-service.js';
import { createAgentService } from '../domain/agent-service.js';
import { createTokenHandlers } from './create-token-handlers.js';
import {
  createStoreBackedTokenPersist,
  createStoreBackedTokenReissue,
} from '../infrastructure/store-backed-token-persist.js';
import { handleReissueAgentToken } from './handle-reissue-agent-token.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import { principalKindOf } from '../domain/user.js';
import { ResultAsync } from 'neverthrow';
import { createFakeTokenStore } from '../infrastructure/fake-token-store.js';
import { createFakeUserStore } from '../infrastructure/fake-user-store.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../infrastructure/fake-organization-membership-store.js';
import { createFakeUserSessionStore } from '../infrastructure/fake-user-session-store.js';
import { createCombinedAuthMiddleware } from './combined-auth-middleware.js';
import { createTokenService } from '../domain/token-service.js';
import type { User } from '../domain/user.js';
import type { Organization } from '../domain/organization.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { UserSession } from '../domain/user-session.js';
import type { ApiToken } from '../domain/api-token.js';
import {
  createFakeClock,
  createFakeIdGenerator,
  createFakePasswordHasher,
} from '@yoink/infrastructure';

const USER_SESSION_COOKIE = 'user_session';

describe('organization routes', () => {
  let app: FastifyInstance;
  let sessionStore: ReturnType<typeof createFakeUserSessionStore>;
  let membershipStore: ReturnType<typeof createFakeOrganizationMembershipStore>;

  const personalOrg: Organization = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Personal',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const teamOrg: Organization = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Team Org',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const otherOrg: Organization = {
    id: '550e8400-e29b-41d4-a716-446655440003',
    name: 'Other Org',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const testUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    email: 'test@example.com',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const agentUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440011',
    email: 'agent-550e8400-e29b-41d4-a716-446655440011@yoink.invalid',
    name: 'Roster bot',
    kind: 'agent',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const agentToken: ApiToken = {
    id: '550e8400-e29b-41d4-a716-446655440040',
    userId: agentUser.id,
    organizationId: teamOrg.id,
    tokenHash: 'fake-hash:agent-secret',
    name: 'Roster bot',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const agentRawToken = `${agentToken.id}:agent-secret`;

  const ownerToken: ApiToken = {
    id: '550e8400-e29b-41d4-a716-446655440041',
    userId: testUser.id,
    organizationId: personalOrg.id,
    tokenHash: 'fake-hash:owner-secret',
    name: 'Lane',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const ownerRawToken = `${ownerToken.id}:owner-secret`;

  const teamOwner: User = {
    id: '550e8400-e29b-41d4-a716-446655440012',
    email: 'owner@example.com',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const teamAdmin: User = {
    id: '550e8400-e29b-41d4-a716-446655440013',
    email: 'admin@example.com',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const otherAgent: User = {
    id: '550e8400-e29b-41d4-a716-446655440014',
    email: 'agent-other@yoink.invalid',
    name: 'Other bot',
    kind: 'agent',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const personalMembership: OrganizationMembership = {
    id: '550e8400-e29b-41d4-a716-446655440020',
    userId: testUser.id,
    organizationId: personalOrg.id,
    role: 'admin',
    isPersonalOrg: true,
    joinedAt: '2024-01-01T00:00:00.000Z',
  };

  const teamMembership: OrganizationMembership = {
    id: '550e8400-e29b-41d4-a716-446655440021',
    userId: testUser.id,
    organizationId: teamOrg.id,
    role: 'member',
    isPersonalOrg: false,
    joinedAt: '2024-01-01T00:00:00.000Z',
  };

  const agentMembership: OrganizationMembership = {
    id: '550e8400-e29b-41d4-a716-446655440022',
    userId: agentUser.id,
    organizationId: teamOrg.id,
    role: 'member',
    isPersonalOrg: false,
    joinedAt: '2024-01-01T00:00:00.000Z',
  };

  const teamOwnerMembership: OrganizationMembership = {
    id: '550e8400-e29b-41d4-a716-446655440023',
    userId: teamOwner.id,
    organizationId: teamOrg.id,
    role: 'owner',
    isPersonalOrg: false,
    joinedAt: '2024-01-01T00:00:00.000Z',
  };

  const teamAdminMembership: OrganizationMembership = {
    id: '550e8400-e29b-41d4-a716-446655440024',
    userId: teamAdmin.id,
    organizationId: teamOrg.id,
    role: 'admin',
    isPersonalOrg: false,
    joinedAt: '2024-01-01T00:00:00.000Z',
  };

  const otherAgentMembership: OrganizationMembership = {
    id: '550e8400-e29b-41d4-a716-446655440025',
    userId: otherAgent.id,
    organizationId: otherOrg.id,
    role: 'member',
    isPersonalOrg: false,
    joinedAt: '2024-01-01T00:00:00.000Z',
  };

  const testSession: UserSession = {
    id: '550e8400-e29b-41d4-a716-446655440030',
    userId: testUser.id,
    currentOrganizationId: personalOrg.id,
    createdAt: '2024-01-01T00:00:00.000Z',
    expiresAt: '2024-12-31T00:00:00.000Z',
    lastActiveAt: '2024-06-15T12:00:00.000Z',
  };

  const teamOwnerSession: UserSession = {
    id: '550e8400-e29b-41d4-a716-446655440031',
    userId: teamOwner.id,
    currentOrganizationId: teamOrg.id,
    createdAt: '2024-01-01T00:00:00.000Z',
    expiresAt: '2024-12-31T00:00:00.000Z',
    lastActiveAt: '2024-06-15T12:00:00.000Z',
  };

  const teamAdminSession: UserSession = {
    id: '550e8400-e29b-41d4-a716-446655440032',
    userId: teamAdmin.id,
    currentOrganizationId: teamOrg.id,
    createdAt: '2024-01-01T00:00:00.000Z',
    expiresAt: '2024-12-31T00:00:00.000Z',
    lastActiveAt: '2024-06-15T12:00:00.000Z',
  };

  beforeEach(async () => {
    const clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    const idGenerator = createFakeIdGenerator();

    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [personalOrg, teamOrg, otherOrg],
    });
    const userStore = createFakeUserStore({
      initialUsers: [testUser, agentUser, teamOwner, teamAdmin, otherAgent],
    });
    membershipStore = createFakeOrganizationMembershipStore({
      initialMemberships: [
        personalMembership,
        teamMembership,
        agentMembership,
        teamOwnerMembership,
        teamAdminMembership,
        otherAgentMembership,
      ],
    });
    const tokenStore = createFakeTokenStore({
      initialTokens: [agentToken, ownerToken],
    });
    sessionStore = createFakeUserSessionStore({
      initialSessions: [testSession, teamOwnerSession, teamAdminSession],
    });

    const userService = createUserService({ userStore });
    const membershipService = createMembershipService({
      membershipStore,
      userService,
      organizationStore,
      clock,
      idGenerator,
    });

    const sessionService = createSessionService({
      sessionStore,
      userService,
      membershipService,
      clock,
      idGenerator,
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
      refreshThresholdMs: 24 * 60 * 60 * 1000,
    });

    const passwordHasher = createFakePasswordHasher();
    const tokenHandlers = createTokenHandlers({
      listOrgTokens: (organizationId) => tokenStore.findByOrganizationId(organizationId),
      load: (id) => tokenStore.findById(id),
      loadMembership: (userId, organizationId) =>
        membershipStore
          .findByUserAndOrg(userId, organizationId)
          .mapErr((error) => tokenStorageError(error.message, error))
          .map((membership) => (membership ? { role: membership.role } : null)),
      loadOwner: (userId) =>
        userStore
          .findById(userId)
          .mapErr((error) => tokenStorageError(error.message, error))
          .map((user) =>
            user
              ? {
                  userId: user.id,
                  name: user.name ?? null,
                  kind: principalKindOf(user),
                }
              : null
          ),
      persist: createStoreBackedTokenPersist(tokenStore),
      hashSecret: (secret) =>
        ResultAsync.fromPromise(
          passwordHasher.hash(secret),
          (error) => tokenStorageError('Failed to hash token secret', error)
        ),
      nextId: () => idGenerator.generate(),
      nextSecret: () => idGenerator.generate(),
      now: () => clock.now().toISOString(),
      maxTokensPerUserPerOrg: 50,
    });

    const agentService = createAgentService({
      userService,
      membershipService,
      createToken: (command) =>
        tokenHandlers.create(command).map(({ token, rawToken }) => ({ token, rawToken })),
      clock,
      idGenerator,
      reissueAgentToken: (command) =>
        handleReissueAgentToken(command, {
          loadMembership: (userId, organizationId) =>
            membershipService.getMembership({ userId, organizationId }),
          loadUser: (userId) => userService.getUser(userId),
          listMemberTokens: (userId, organizationId) =>
            tokenStore.findByUserAndOrganization(userId, organizationId),
          persistReissue: createStoreBackedTokenReissue(tokenStore),
          hashSecret: (secret) =>
            ResultAsync.fromPromise(
              passwordHasher.hash(secret),
              (error) => tokenStorageError('Failed to hash token secret', error)
            ),
          nextId: () => idGenerator.generate(),
          nextSecret: () => idGenerator.generate(),
          now: () => clock.now().toISOString(),
        }),
    });

    app = Fastify();
    await app.register(cookie);

    const authMiddleware = createCombinedAuthMiddleware({
      tokenService: createTokenService({
        organizationStore,
        userStore,
        tokenStore,
        passwordHasher: createFakePasswordHasher(),
        clock,
      }),
      sessionService,
      sessionCookieName: USER_SESSION_COOKIE,
    });

    await registerOrganizationRoutes(app, {
      sessionService,
      membershipService,
      userService,
      agentService,
      authMiddleware,
    });

    await app.ready();
  });

  describe('POST /api/organizations/switch', () => {
    it('switches to another organization the user is a member of', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/organizations/switch',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
        payload: { organizationId: teamOrg.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      // Verify session was updated
      const updatedSession = await sessionStore.findById(testSession.id);
      expect(updatedSession.isOk() && updatedSession.value?.currentOrganizationId).toBe(teamOrg.id);
    });

    it('returns 400 when trying to switch to org user is not a member of', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/organizations/switch',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
        payload: { organizationId: otherOrg.id },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('not a member');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/organizations/switch',
        payload: { organizationId: teamOrg.id },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for invalid organizationId format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/organizations/switch',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
        payload: { organizationId: 'not-a-uuid' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/organizations/:organizationId/leave', () => {
    it('leaves an organization the user is a member of', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/leave`,
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });

    it('returns 404 when not a member of the organization', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${otherOrg.id}/leave`,
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().message).toContain('Not a member');
    });

    it('returns 400 when trying to leave personal organization', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${personalOrg.id}/leave`,
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('Cannot leave your personal organization');
    });

    // Note: The LAST_ADMIN case is thoroughly tested in membership-service.test.ts
    // The routes layer simply forwards the domain error to a 400 response.
    // Testing it here would require significant setup duplication.

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/leave`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 for invalid organizationId format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/organizations/not-a-uuid/leave',
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/organizations/:organizationId/members', () => {
    it('lists members for a session-authenticated member', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/organizations/${teamOrg.id}/members`,
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(200);
      const { members } = response.json() as {
        members: Array<{ userId: string; kind: 'human' | 'agent' }>;
      };
      expect(members.some((m) => m.userId === testUser.id && m.kind === 'human')).toBe(true);
      expect(members.some((m) => m.userId === agentUser.id && m.kind === 'agent')).toBe(true);
    });

    it('lists members for an agent token, including the agent and minting human', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/organizations/${teamOrg.id}/members`,
        headers: { authorization: `Bearer ${agentRawToken}` },
      });

      expect(response.statusCode).toBe(200);
      const { members } = response.json() as {
        members: Array<{ userId: string; kind: 'human' | 'agent'; name?: string }>;
      };
      expect(members.some((m) => m.userId === agentUser.id && m.kind === 'agent')).toBe(true);
      expect(members.some((m) => m.userId === testUser.id && m.kind === 'human')).toBe(true);
    });

    it('returns 403 when the caller is not a member of the organization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/organizations/${personalOrg.id}/members`,
        headers: { authorization: `Bearer ${agentRawToken}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toContain('Not a member');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/organizations/${teamOrg.id}/members`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('agent token cannot administer membership', () => {
    it('cannot mint another agent', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/agents`,
        headers: { authorization: `Bearer ${agentRawToken}` },
        payload: { name: 'Nope' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toContain('Bot tokens cannot');
    });

    it('cannot mint an agent with a human-owned bot token', async () => {
      const membersBefore = await membershipStore.findByOrganizationId(personalOrg.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${personalOrg.id}/agents`,
        headers: { authorization: `Bearer ${ownerRawToken}` },
        payload: { name: 'Vault bot' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toContain('Bot tokens cannot');

      const membersAfter = await membershipStore.findByOrganizationId(personalOrg.id);
      expect(membersAfter._unsafeUnwrap()).toHaveLength(membersBefore._unsafeUnwrap().length);
    });

    it('cannot remove a member', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/organizations/${teamOrg.id}/members/${testUser.id}`,
        headers: { authorization: `Bearer ${agentRawToken}` },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/organizations/:organizationId/members/:userId/token', () => {
    it('lets the owner reissue so the old token is 401 and the new one works', async () => {
      const membersBefore = await membershipStore.findByOrganizationId(teamOrg.id);

      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/members/${agentUser.id}/token`,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json() as { rawToken: string; token: { name: string | null } };
      expect(body.token.name).toBe('Roster bot');
      expect(body.rawToken).toMatch(/^[^:]+:[^:]+$/);

      const oldAuth = await app.inject({
        method: 'GET',
        url: `/api/organizations/${teamOrg.id}/members`,
        headers: { authorization: `Bearer ${agentRawToken}` },
      });
      expect(oldAuth.statusCode).toBe(401);

      const newAuth = await app.inject({
        method: 'GET',
        url: `/api/organizations/${teamOrg.id}/members`,
        headers: { authorization: `Bearer ${body.rawToken}` },
      });
      expect(newAuth.statusCode).toBe(200);
      const { members } = newAuth.json() as {
        members: Array<{ userId: string; name?: string; kind: string }>;
      };
      expect(members.filter((member) => member.userId === agentUser.id)).toHaveLength(1);
      expect(members.find((member) => member.userId === agentUser.id)?.name).toBe('Roster bot');

      const membersAfter = await membershipStore.findByOrganizationId(teamOrg.id);
      expect(membersAfter._unsafeUnwrap()).toHaveLength(membersBefore._unsafeUnwrap().length);
    });

    it('returns 403 when a bot token tries', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/members/${agentUser.id}/token`,
        headers: { authorization: `Bearer ${agentRawToken}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toContain('Bot tokens cannot');
    });

    it('returns 403 when a non-owner human tries', async () => {
      const asMember = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/members/${agentUser.id}/token`,
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });
      expect(asMember.statusCode).toBe(403);

      const asAdmin = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/members/${agentUser.id}/token`,
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
      });
      expect(asAdmin.statusCode).toBe(403);
    });

    it('returns 404 when the target is a human member', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/members/${testUser.id}/token`,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when the target is in another organization', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/members/${otherAgent.id}/token`,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
