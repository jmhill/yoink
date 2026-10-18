import { Writable } from 'node:stream';
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
  createStoreBackedTokenCreated,
  createStoreBackedTokenRevoked,
  createStoreBackedTokenReissue,
} from '../infrastructure/store-backed-token-persist.js';
import { handleReissueAgentToken } from './handle-reissue-agent-token.js';
import { handleTransferOwnership } from './handle-transfer-ownership.js';
import { handleChangeMemberRole } from './handle-change-member-role.js';
import { handleRemoveMember } from './handle-remove-member.js';
import {
  ALREADY_OWNER_MESSAGE,
  BOT_CANNOT_BE_OWNER_MESSAGE,
  BOT_CANNOT_TRANSFER_OWNERSHIP_MESSAGE,
  BOT_CANNOT_BE_ADMIN_MESSAGE,
  BOT_CANNOT_CHANGE_ROLES_MESSAGE,
  CANNOT_CHANGE_OWN_ROLE_MESSAGE,
  CANNOT_REMOVE_SELF_MESSAGE,
  CHANGE_ROLE_STORAGE_MESSAGE,
  HAND_OVER_OWNERSHIP_FIRST_MESSAGE,
  HANDOVER_OWNERSHIP_PATH,
  OWNER_ROLE_LOCKED_MESSAGE,
  REISSUE_NOT_ALLOWED_MESSAGE,
  REISSUE_TOKEN_STORAGE_MESSAGE,
  REMOVE_NOT_ALLOWED_MESSAGE,
  removeMemberFailedMessage,
  ROLE_CHANGE_NOT_ALLOWED_MESSAGE,
  THE_OWNER_CANT_BE_REMOVED_MESSAGE,
  NOT_CURRENT_OWNER_MESSAGE,
  PERSONAL_WORKSPACE_TRANSFER_MESSAGE,
  TARGET_NOT_WORKSPACE_MEMBER_MESSAGE,
  TRANSFER_OWNERSHIP_STORAGE_MESSAGE,
} from '@yoink/api-contracts';
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
const PINO_ERROR_LEVEL = 50;

type PinoLogLine = {
  level: number;
  msg?: string;
  error?: unknown;
};

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

  const outsider: User = {
    id: '550e8400-e29b-41d4-a716-446655440015',
    email: 'outsider@example.com',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const extraAdmin: User = {
    id: '550e8400-e29b-41d4-a716-446655440016',
    email: 'admin2@example.com',
    name: 'Libby',
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

  const extraAdminMembership: OrganizationMembership = {
    id: '550e8400-e29b-41d4-a716-446655440026',
    userId: extraAdmin.id,
    organizationId: teamOrg.id,
    role: 'admin',
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
      initialUsers: [testUser, agentUser, teamOwner, teamAdmin, otherAgent, outsider, extraAdmin],
    });
    membershipStore = createFakeOrganizationMembershipStore({
      initialMemberships: [
        personalMembership,
        teamMembership,
        agentMembership,
        teamOwnerMembership,
        teamAdminMembership,
        otherAgentMembership,
        extraAdminMembership,
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
      listUserOrgTokens: (userId, organizationId) =>
        tokenStore.findByUserAndOrganization(userId, organizationId),
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
                  kind: principalKindOf(user),
                }
              : null
          ),
      persistCreate: createStoreBackedTokenCreated(tokenStore),
      persistRevoke: createStoreBackedTokenRevoked(tokenStore),
      hashSecret: (secret) =>
        ResultAsync.fromPromise(
          passwordHasher.hash(secret),
          (error) => tokenStorageError('Failed to hash token secret', error)
        ),
      nextId: () => idGenerator.generate(),
      nextSecret: () => idGenerator.generate(),
      now: () => clock.now().toISOString(),
      maxTokensPerUserPerOrg: 2,
    });

    const agentService = createAgentService({
      userService,
      membershipService,
      createToken: (command) =>
        tokenHandlers.create(command).map(({ token, rawToken }) => ({ token, rawToken })),
      clock,
      idGenerator,
    });
    const transferOwnership = (request: Parameters<typeof handleTransferOwnership>[0]) =>
      handleTransferOwnership(request, {
        loadMembers: (organizationId) => membershipStore.findByOrganizationId(organizationId),
        loadUser: (userId) => userService.getUser(userId),
        persistTransfer: ({ plan, event }) => membershipStore.transferOwnership(plan, event),
        nextId: () => idGenerator.generate(),
        now: () => clock.now().toISOString(),
      });

    const changeMemberRole = (request: Parameters<typeof handleChangeMemberRole>[0]) =>
      handleChangeMemberRole(request, {
        loadMembers: (organizationId) => membershipStore.findByOrganizationId(organizationId),
        loadUser: (userId) => userService.getUser(userId),
        persistChange: ({ membership, event }) =>
          membershipStore.changeMemberRole(membership, event),
        nextId: () => idGenerator.generate(),
        now: () => clock.now().toISOString(),
      });

    const removeMember = (request: Parameters<typeof handleRemoveMember>[0]) =>
      handleRemoveMember(request, {
        loadMembers: (organizationId) => membershipStore.findByOrganizationId(organizationId),
        loadUser: (userId) => userService.getUser(userId),
        persistRemove: ({ membershipId, event }) =>
          membershipStore.removeMember(membershipId, event),
        nextId: () => idGenerator.generate(),
        now: () => clock.now().toISOString(),
      });

    const reissueAgentToken = (command: Parameters<typeof handleReissueAgentToken>[0]) =>
      handleReissueAgentToken(command, {
        loadMembership: (userId, organizationId) =>
          membershipStore.findByUserAndOrg(userId, organizationId),
        loadUser: (userId) => userService.getUser(userId),
        persistReissue: createStoreBackedTokenReissue(tokenStore),
        hashSecret: (secret) =>
          ResultAsync.fromPromise(
            passwordHasher.hash(secret),
            (error) => tokenStorageError('Failed to hash token secret', error)
          ),
        nextId: () => idGenerator.generate(),
        nextSecret: () => idGenerator.generate(),
        now: () => clock.now().toISOString(),
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
      reissueAgentToken,
      transferOwnership,
      changeMemberRole,
      removeMember,
      authMiddleware,
    });

    await app.ready();
  });

  const createLoggedOrgApp = async (options: {
    shouldFailOnChangeMemberRole?: boolean;
    shouldFailOnRemoveMember?: boolean;
    tokenShouldFailOnSave?: boolean;
  }): Promise<{ app: FastifyInstance; logs: PinoLogLine[] }> => {
    const logs: PinoLogLine[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        const text = String(chunk);
        for (const part of text.split('\n')) {
          if (part.length === 0) {
            continue;
          }
          logs.push(JSON.parse(part) as PinoLogLine);
        }
        callback();
      },
    });
    const failingApp = Fastify({
      logger: {
        level: 'error',
        stream,
      },
    });
    await failingApp.register(cookie);
    const clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    const idGenerator = createFakeIdGenerator();
    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [personalOrg, teamOrg, otherOrg],
    });
    const userStore = createFakeUserStore({
      initialUsers: [testUser, agentUser, teamOwner, teamAdmin, otherAgent, outsider, extraAdmin],
    });
    const failingMembershipStore = createFakeOrganizationMembershipStore({
      initialMemberships: [
        personalMembership,
        teamMembership,
        agentMembership,
        teamOwnerMembership,
        teamAdminMembership,
        otherAgentMembership,
        extraAdminMembership,
      ],
      shouldFailOnChangeMemberRole: options.shouldFailOnChangeMemberRole,
      shouldFailOnRemoveMember: options.shouldFailOnRemoveMember,
    });
    const failingTokenStore = createFakeTokenStore({
      initialTokens: [agentToken, ownerToken],
      shouldFailOnSave: options.tokenShouldFailOnSave,
    });
    const userService = createUserService({ userStore });
    const membershipService = createMembershipService({
      membershipStore: failingMembershipStore,
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
    await registerOrganizationRoutes(failingApp, {
      sessionService,
      membershipService,
      userService,
      agentService: createAgentService({
        userService,
        membershipService,
        createToken: () => {
          throw new Error('unused');
        },
        clock,
        idGenerator,
      }),
      reissueAgentToken: (command) =>
        handleReissueAgentToken(command, {
          loadMembership: (userId, organizationId) =>
            failingMembershipStore.findByUserAndOrg(userId, organizationId),
          loadUser: (userId) => userService.getUser(userId),
          persistReissue: createStoreBackedTokenReissue(failingTokenStore),
          hashSecret: (secret) =>
            ResultAsync.fromPromise(
              passwordHasher.hash(secret),
              (error) => tokenStorageError('Failed to hash token secret', error)
            ),
          nextId: () => idGenerator.generate(),
          nextSecret: () => idGenerator.generate(),
          now: () => clock.now().toISOString(),
        }),
      transferOwnership: (request) =>
        handleTransferOwnership(request, {
          loadMembers: (organizationId) =>
            failingMembershipStore.findByOrganizationId(organizationId),
          loadUser: (userId) => userService.getUser(userId),
          persistTransfer: ({ plan, event }) =>
            failingMembershipStore.transferOwnership(plan, event),
          nextId: () => idGenerator.generate(),
          now: () => clock.now().toISOString(),
        }),
      changeMemberRole: (request) =>
        handleChangeMemberRole(request, {
          loadMembers: (organizationId) =>
            failingMembershipStore.findByOrganizationId(organizationId),
          loadUser: (userId) => userService.getUser(userId),
          persistChange: ({ membership, event }) =>
            failingMembershipStore.changeMemberRole(membership, event),
          nextId: () => idGenerator.generate(),
          now: () => clock.now().toISOString(),
        }),
      removeMember: (request) =>
        handleRemoveMember(request, {
          loadMembers: (organizationId) =>
            failingMembershipStore.findByOrganizationId(organizationId),
          loadUser: (userId) => userService.getUser(userId),
          persistRemove: ({ membershipId, event }) =>
            failingMembershipStore.removeMember(membershipId, event),
          nextId: () => idGenerator.generate(),
          now: () => clock.now().toISOString(),
        }),
      authMiddleware: createCombinedAuthMiddleware({
        tokenService: createTokenService({
          organizationStore,
          userStore,
          tokenStore: failingTokenStore,
          passwordHasher: createFakePasswordHasher(),
          clock,
        }),
        sessionService,
        sessionCookieName: USER_SESSION_COOKIE,
      }),
    });
    await failingApp.ready();
    return { app: failingApp, logs };
  };

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
      expect(membershipStore.recordedEvents().some((event) => event.type === 'MemberLeft')).toBe(
        true
      );
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

    it('returns 409 when the owner tries to leave', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/leave`,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().message).toBe(HAND_OVER_OWNERSHIP_FIRST_MESSAGE);
      expect(response.json().code).toBe('OWNER_MUST_TRANSFER');
      expect(response.json().handoverPath).toBe(HANDOVER_OWNERSHIP_PATH);
    });

    it('allows the last admin to leave when an owner remains', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/leave`,
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
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

  describe('DELETE /api/organizations/:organizationId/members/:userId', () => {
    it('returns 409 OWNER_CANNOT_BE_REMOVED when an admin removes the owner', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/organizations/${teamOrg.id}/members/${teamOwner.id}`,
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('OWNER_CANNOT_BE_REMOVED');
      expect(response.json().message).toBe(THE_OWNER_CANT_BE_REMOVED_MESSAGE);
      expect(response.json().handoverPath).toBeUndefined();
    });

    it('returns 409 OWNER_CANNOT_BE_REMOVED when a member removes the owner', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/organizations/${teamOrg.id}/members/${teamOwner.id}`,
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('OWNER_CANNOT_BE_REMOVED');
      expect(response.json().message).toBe(THE_OWNER_CANT_BE_REMOVED_MESSAGE);
      expect(response.json().handoverPath).toBeUndefined();
    });

    it('returns 403 when a member removes another member (permission first)', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/organizations/${teamOrg.id}/members/${agentUser.id}`,
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('REMOVE_NOT_ALLOWED');
      expect(response.json().message).toBe(REMOVE_NOT_ALLOWED_MESSAGE);
    });

    it('returns 400 CANNOT_REMOVE_SELF when removing yourself', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/organizations/${teamOrg.id}/members/${teamAdmin.id}`,
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('CANNOT_REMOVE_SELF');
      expect(response.json().message).toBe(CANNOT_REMOVE_SELF_MESSAGE);
    });

    it('lets an admin remove another admin', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/organizations/${teamOrg.id}/members/${extraAdmin.id}`,
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
      });

      expect(response.statusCode).toBe(204);
    });

    it('allows the owner to remove the last admin', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/organizations/${teamOrg.id}/members/${teamAdmin.id}`,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 400 when removing a member from a personal workspace', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/organizations/${personalOrg.id}/members/${testUser.id}`,
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toMatch(/personal/i);
    });

    it('returns 500 with the storage message and logs at error when persist fails', async () => {
      const { app: failingApp, logs } = await createLoggedOrgApp({
        shouldFailOnRemoveMember: true,
      });
      const response = await failingApp.inject({
        method: 'DELETE',
        url: `/api/organizations/${teamOrg.id}/members/${extraAdmin.id}`,
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().message).toBe(removeMemberFailedMessage('Libby'));
      expect(logs.some((line) => line.level === PINO_ERROR_LEVEL && line.error !== undefined)).toBe(
        true
      );
      await failingApp.close();
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
      expect(response.json().message).toContain('API tokens cannot');
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
      expect(response.json().message).toContain('API tokens cannot');

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
        payload: {},
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
        payload: {},
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toContain('API tokens cannot');
    });

    it('returns 403 REISSUE_NOT_ALLOWED when a member tries', async () => {
      const asMember = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/members/${agentUser.id}/token`,
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
        payload: {},
      });
      expect(asMember.statusCode).toBe(403);
      expect(asMember.json().code).toBe('REISSUE_NOT_ALLOWED');
      expect(asMember.json().message).toBe(REISSUE_NOT_ALLOWED_MESSAGE);
    });

    it('lets an admin reissue so the old token is 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/members/${agentUser.id}/token`,
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
        payload: {},
      });
      expect(response.statusCode).toBe(201);
      const oldAuth = await app.inject({
        method: 'GET',
        url: `/api/organizations/${teamOrg.id}/members`,
        headers: { authorization: `Bearer ${agentRawToken}` },
      });
      expect(oldAuth.statusCode).toBe(401);
    });

    it('returns 500 with the storage message and logs at error when persist fails', async () => {
      const { app: failingApp, logs } = await createLoggedOrgApp({
        tokenShouldFailOnSave: true,
      });
      const response = await failingApp.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/members/${agentUser.id}/token`,
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
        payload: {},
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().message).toBe(REISSUE_TOKEN_STORAGE_MESSAGE);
      expect(
        logs.some(
          (line) =>
            line.level === PINO_ERROR_LEVEL &&
            line.msg === 'Failed to reissue agent token' &&
            line.error !== undefined
        )
      ).toBe(true);
      await failingApp.close();
    });
  });

  describe('PATCH /api/organizations/:organizationId/members/:userId/role', () => {
    const roleUrl = (userId: string) =>
      `/api/organizations/${teamOrg.id}/members/${userId}/role`;

    it('lets an admin promote a member', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: roleUrl(testUser.id),
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
        payload: { role: 'admin' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().member.role).toBe('admin');
      expect(membershipStore.recordedEvents().some((event) => event.type === 'MemberRoleChanged')).toBe(
        true
      );
    });

    it('returns unchanged 200 with no event when the role is already set', async () => {
      const before = membershipStore.recordedEvents().length;
      const response = await app.inject({
        method: 'PATCH',
        url: roleUrl(teamAdmin.id),
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
        payload: { role: 'admin' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().member.role).toBe('admin');
      expect(membershipStore.recordedEvents()).toHaveLength(before);
    });

    it('refuses a bot token with BOT_CANNOT_CHANGE_ROLES', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: roleUrl(testUser.id),
        headers: { authorization: `Bearer ${agentRawToken}` },
        payload: { role: 'admin' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('BOT_CANNOT_CHANGE_ROLES');
      expect(response.json().message).toBe(BOT_CANNOT_CHANGE_ROLES_MESSAGE);
    });

    it('refuses a human personal token with BOT_CANNOT_CHANGE_ROLES', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/organizations/${personalOrg.id}/members/${testUser.id}/role`,
        headers: { authorization: `Bearer ${ownerRawToken}` },
        payload: { role: 'admin' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('BOT_CANNOT_CHANGE_ROLES');
    });

    it('refuses a member with ROLE_CHANGE_NOT_ALLOWED', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: roleUrl(extraAdmin.id),
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
        payload: { role: 'member' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('ROLE_CHANGE_NOT_ALLOWED');
      expect(response.json().message).toBe(ROLE_CHANGE_NOT_ALLOWED_MESSAGE);
    });

    it('refuses changing your own role', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: roleUrl(teamAdmin.id),
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
        payload: { role: 'member' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('CANNOT_CHANGE_OWN_ROLE');
      expect(response.json().message).toBe(CANNOT_CHANGE_OWN_ROLE_MESSAGE);
    });

    it('refuses changing the owner', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: roleUrl(teamOwner.id),
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
        payload: { role: 'admin' },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('OWNER_ROLE_LOCKED');
      expect(response.json().message).toBe(OWNER_ROLE_LOCKED_MESSAGE);
    });

    it('refuses promoting a bot', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: roleUrl(agentUser.id),
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
        payload: { role: 'admin' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
      expect(response.json().message).toBe(BOT_CANNOT_BE_ADMIN_MESSAGE);
    });

    it('returns 400 validation when the body role is owner', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: roleUrl(testUser.id),
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
        payload: { role: 'owner' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('after a demotion the demoted person cannot remove or reissue', async () => {
      const demote = await app.inject({
        method: 'PATCH',
        url: roleUrl(teamAdmin.id),
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
        payload: { role: 'member' },
      });
      expect(demote.statusCode).toBe(200);
      expect(demote.json().member.role).toBe('member');

      const remove = await app.inject({
        method: 'DELETE',
        url: `/api/organizations/${teamOrg.id}/members/${extraAdmin.id}`,
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
      });
      expect(remove.statusCode).toBe(403);
      expect(remove.json().code).toBe('REMOVE_NOT_ALLOWED');

      const reissue = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/members/${agentUser.id}/token`,
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
        payload: {},
      });
      expect(reissue.statusCode).toBe(403);
      expect(reissue.json().code).toBe('REISSUE_NOT_ALLOWED');
    });

    it('returns 500 with the storage message and logs at error when persist fails', async () => {
      const { app: failingApp, logs } = await createLoggedOrgApp({
        shouldFailOnChangeMemberRole: true,
      });
      const response = await failingApp.inject({
        method: 'PATCH',
        url: roleUrl(testUser.id),
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
        payload: { role: 'admin' },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().message).toBe(CHANGE_ROLE_STORAGE_MESSAGE);
      expect(logs.some((line) => line.level === PINO_ERROR_LEVEL && line.error !== undefined)).toBe(
        true
      );
      await failingApp.close();
    });
  });

  describe('POST /api/organizations/:organizationId/members/:userId/token not-found', () => {
    it('returns 404 when the target is a human member', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/members/${testUser.id}/token`,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 when the target is in another organization', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${teamOrg.id}/members/${otherAgent.id}/token`,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/organizations/:organizationId/owner/transfer', () => {
    const transferUrl = `/api/organizations/${teamOrg.id}/owner/transfer`;

    it('hands over to an admin', async () => {
      const response = await app.inject({
        method: 'POST',
        url: transferUrl,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
        payload: { userId: teamAdmin.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        owner: { userId: teamAdmin.id, role: 'owner', email: teamAdmin.email },
        previousOwner: { userId: teamOwner.id, role: 'admin', email: teamOwner.email },
      });

      const oldOwner = await membershipStore.findByUserAndOrg(teamOwner.id, teamOrg.id);
      const newOwner = await membershipStore.findByUserAndOrg(teamAdmin.id, teamOrg.id);
      expect(oldOwner.isOk() && oldOwner.value?.role).toBe('admin');
      expect(newOwner.isOk() && newOwner.value?.role).toBe('owner');
    });

    it('hands over to a member', async () => {
      const response = await app.inject({
        method: 'POST',
        url: transferUrl,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
        payload: { userId: testUser.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().owner.userId).toBe(testUser.id);
      expect(response.json().owner.role).toBe('owner');
      expect(response.json().previousOwner.userId).toBe(teamOwner.id);
      expect(response.json().previousOwner.role).toBe('admin');
    });

    it('returns 403 when a bot calls it', async () => {
      const response = await app.inject({
        method: 'POST',
        url: transferUrl,
        headers: { authorization: `Bearer ${agentRawToken}` },
        payload: { userId: teamAdmin.id },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('BOT_CANNOT_TRANSFER_OWNERSHIP');
      expect(response.json().message).toBe(BOT_CANNOT_TRANSFER_OWNERSHIP_MESSAGE);
    });

    it('returns 403 when an admin tries', async () => {
      const response = await app.inject({
        method: 'POST',
        url: transferUrl,
        cookies: { [USER_SESSION_COOKIE]: teamAdminSession.id },
        payload: { userId: testUser.id },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('NOT_CURRENT_OWNER');
      expect(response.json().message).toBe(NOT_CURRENT_OWNER_MESSAGE);
    });

    it('returns 400 for a personal workspace', async () => {
      await membershipStore.save({ ...personalMembership, role: 'owner' });
      const response = await app.inject({
        method: 'POST',
        url: `/api/organizations/${personalOrg.id}/owner/transfer`,
        cookies: { [USER_SESSION_COOKIE]: testSession.id },
        payload: { userId: testUser.id },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('PERSONAL_WORKSPACE_TRANSFER');
      expect(response.json().message).toBe(PERSONAL_WORKSPACE_TRANSFER_MESSAGE);
    });

    it('returns 400 when handing over to yourself', async () => {
      const response = await app.inject({
        method: 'POST',
        url: transferUrl,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
        payload: { userId: teamOwner.id },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('ALREADY_OWNER');
      expect(response.json().message).toBe(ALREADY_OWNER_MESSAGE);
    });

    it('returns 404 when the target user does not exist', async () => {
      const response = await app.inject({
        method: 'POST',
        url: transferUrl,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
        payload: { userId: '550e8400-e29b-41d4-a716-446655440099' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('USER_NOT_FOUND');
      expect(response.json().message).toBe('User not found');
    });

    it('returns 400 when the target is a bot', async () => {
      const response = await app.inject({
        method: 'POST',
        url: transferUrl,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
        payload: { userId: agentUser.id },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('BOT_CANNOT_HAVE_PRIVILEGED_ROLE');
      expect(response.json().message).toBe(BOT_CANNOT_BE_OWNER_MESSAGE);
    });

    it('returns 400 when the target is not in the workspace', async () => {
      const response = await app.inject({
        method: 'POST',
        url: transferUrl,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
        payload: { userId: outsider.id },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('TARGET_NOT_WORKSPACE_MEMBER');
      expect(response.json().message).toBe(TARGET_NOT_WORKSPACE_MEMBER_MESSAGE);
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: transferUrl,
        payload: { userId: teamAdmin.id },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 500 with the storage message when persist fails', async () => {
      const failingStore = createFakeOrganizationMembershipStore({
        initialMemberships: [
          personalMembership,
          teamMembership,
          agentMembership,
          teamOwnerMembership,
          teamAdminMembership,
          otherAgentMembership,
        ],
        shouldFailOnTransferOwnership: true,
      });
      const failingApp = Fastify();
      await failingApp.register(cookie);
      const clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
      const idGenerator = createFakeIdGenerator();
      const organizationStore = createFakeOrganizationStore({
        initialOrganizations: [personalOrg, teamOrg, otherOrg],
      });
      const userStore = createFakeUserStore({
        initialUsers: [testUser, agentUser, teamOwner, teamAdmin, otherAgent, outsider, extraAdmin],
      });
      const userService = createUserService({ userStore });
      const membershipService = createMembershipService({
        membershipStore: failingStore,
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
      await registerOrganizationRoutes(failingApp, {
        sessionService,
        membershipService,
        userService,
        agentService: createAgentService({
          userService,
          membershipService,
          createToken: () => {
            throw new Error('unused');
          },
          clock,
          idGenerator,
        }),
        reissueAgentToken: () => {
          throw new Error('unused');
        },
        transferOwnership: (request) =>
          handleTransferOwnership(request, {
            loadMembers: (organizationId) => failingStore.findByOrganizationId(organizationId),
            loadUser: (userId) => userService.getUser(userId),
            persistTransfer: ({ plan, event }) => failingStore.transferOwnership(plan, event),
            nextId: () => idGenerator.generate(),
            now: () => clock.now().toISOString(),
          }),
        changeMemberRole: (request) =>
          handleChangeMemberRole(request, {
            loadMembers: (organizationId) => failingStore.findByOrganizationId(organizationId),
            loadUser: (userId) => userService.getUser(userId),
            persistChange: ({ membership, event }) =>
              failingStore.changeMemberRole(membership, event),
            nextId: () => idGenerator.generate(),
            now: () => clock.now().toISOString(),
          }),
        removeMember: (request) =>
          handleRemoveMember(request, {
            loadMembers: (organizationId) => failingStore.findByOrganizationId(organizationId),
            loadUser: (userId) => userService.getUser(userId),
            persistRemove: ({ membershipId, event }) =>
              failingStore.removeMember(membershipId, event),
            nextId: () => idGenerator.generate(),
            now: () => clock.now().toISOString(),
          }),
        authMiddleware: createCombinedAuthMiddleware({
          tokenService: createTokenService({
            organizationStore,
            userStore,
            tokenStore: createFakeTokenStore({ initialTokens: [] }),
            passwordHasher: createFakePasswordHasher(),
            clock,
          }),
          sessionService,
          sessionCookieName: USER_SESSION_COOKIE,
        }),
      });
      await failingApp.ready();

      const response = await failingApp.inject({
        method: 'POST',
        url: transferUrl,
        cookies: { [USER_SESSION_COOKIE]: teamOwnerSession.id },
        payload: { userId: teamAdmin.id },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().message).toBe(TRANSFER_OWNERSHIP_STORAGE_MESSAGE);
      await failingApp.close();
    });
  });
});
