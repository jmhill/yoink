import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { registerOrganizationRoutes } from './organization-routes.js';
import { createSessionService } from '../domain/session-service.js';
import { createUserService } from '../domain/user-service.js';
import { createMembershipService } from '../domain/membership-service.js';
import { createAgentService } from '../domain/agent-service.js';
import { createUserTokenService } from '../domain/user-token-service.js';
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

  const testSession: UserSession = {
    id: '550e8400-e29b-41d4-a716-446655440030',
    userId: testUser.id,
    currentOrganizationId: personalOrg.id,
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
      initialUsers: [testUser, agentUser],
    });
    const membershipStore = createFakeOrganizationMembershipStore({
      initialMemberships: [personalMembership, teamMembership, agentMembership],
    });
    const tokenStore = createFakeTokenStore({
      initialTokens: [agentToken],
    });
    sessionStore = createFakeUserSessionStore({
      initialSessions: [testSession],
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

    const agentService = createAgentService({
      userService,
      membershipService,
      userTokenService: createUserTokenService({
        tokenStore,
        clock,
        idGenerator,
        passwordHasher: createFakePasswordHasher(),
        maxTokensPerUserPerOrg: 2,
      }),
      clock,
      idGenerator,
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
      expect(response.json().message).toContain('Only owners and admins');
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
});
