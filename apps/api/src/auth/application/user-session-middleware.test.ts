import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import {
  createUserSessionMiddleware,
  USER_SESSION_COOKIE,
} from './user-session-middleware.js';
import { createSessionService, type SessionService } from '../domain/session-service.js';
import { createMembershipService } from '../../organizations/domain/membership-service.js';
import { createUserService } from '../../users/domain/user-service.js';
import { createFakeUserSessionStore } from '../infrastructure/fake-user-session-store.js';
import { createFakeUserStore } from '../../users/infrastructure/fake-user-store.js';
import { createFakeOrganizationMembershipStore } from '../../organizations/infrastructure/fake-organization-membership-store.js';
import { createFakeOrganizationStore } from '../../organizations/infrastructure/fake-organization-store.js';
import type { User } from '../../users/domain/user.js';
import type { OrganizationMembership } from '../../organizations/domain/organization-membership.js';

describe('UserSessionMiddleware', () => {
  let sessionService: SessionService;
  let clock: ReturnType<typeof createFakeClock>;
  let idGenerator: ReturnType<typeof createFakeIdGenerator>;

  const testUser: User = {
    id: 'user-1',
    email: 'alice@example.com',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const personalOrgMembership: OrganizationMembership = {
    id: 'membership-1',
    userId: 'user-1',
    organizationId: 'org-1',
    role: 'owner',
    isPersonalOrg: true,
    joinedAt: '2024-01-01T00:00:00.000Z',
  };

  const createMockRequest = (cookies: Record<string, string> = {}): FastifyRequest => {
    return {
      cookies,
      log: {
        child: vi.fn().mockReturnThis(),
      },
    } as unknown as FastifyRequest;
  };

  const createMockReply = (): FastifyReply => {
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
    return reply;
  };

  beforeEach(() => {
    clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    idGenerator = createFakeIdGenerator();
    const sessionStore = createFakeUserSessionStore();
    const userStore = createFakeUserStore({ initialUsers: [testUser] });
    const userService = createUserService({ userStore });
    const membershipStore = createFakeOrganizationMembershipStore({
      initialMemberships: [personalOrgMembership],
    });
    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [
        { id: 'org-1', name: 'Personal Org', createdAt: '2024-01-01T00:00:00.000Z' },
      ],
    });

    const membershipService = createMembershipService({
      membershipStore,
      userService,
      organizationStore,
      clock,
      idGenerator,
    });

    sessionService = createSessionService({
      sessionStore,
      userService,
      membershipService,
      clock,
      idGenerator,
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
      refreshThresholdMs: 24 * 60 * 60 * 1000,
    });
  });

  describe('with missing session cookie', () => {
    it('returns 401', async () => {
      const middleware = createUserSessionMiddleware({ sessionService });
      const request = createMockRequest({});
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ message: 'Not authenticated' });
    });
  });

  describe('with invalid session id', () => {
    it('returns 401 for non-existent session', async () => {
      const middleware = createUserSessionMiddleware({ sessionService });
      const request = createMockRequest({
        [USER_SESSION_COOKIE]: 'non-existent-session-id',
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ message: 'Invalid or expired session' });
    });
  });

  describe('with expired session', () => {
    it('returns 401', async () => {
      // Create a session
      const createResult = await sessionService.createSession({ userId: testUser.id });
      expect(createResult.isOk()).toBe(true);
      const session = createResult._unsafeUnwrap();

      // Advance time past expiry
      clock.advanceBy(8 * 24 * 60 * 60 * 1000);

      const middleware = createUserSessionMiddleware({ sessionService });
      const request = createMockRequest({
        [USER_SESSION_COOKIE]: session.id,
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ message: 'Invalid or expired session' });
    });
  });

  describe('with valid session', () => {
    it('sets authContext on request', async () => {
      // Create a session
      const createResult = await sessionService.createSession({ userId: testUser.id });
      expect(createResult.isOk()).toBe(true);
      const session = createResult._unsafeUnwrap();

      const middleware = createUserSessionMiddleware({ sessionService });
      const request = createMockRequest({
        [USER_SESSION_COOKIE]: session.id,
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(request.authContext).toEqual({
        userId: testUser.id,
        organizationId: 'org-1',
      });
      expect(reply.status).not.toHaveBeenCalled();
    });

    it('sets userSession on request', async () => {
      // Create a session
      const createResult = await sessionService.createSession({ userId: testUser.id });
      expect(createResult.isOk()).toBe(true);
      const session = createResult._unsafeUnwrap();

      const middleware = createUserSessionMiddleware({ sessionService });
      const request = createMockRequest({
        [USER_SESSION_COOKIE]: session.id,
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(request.userSession).toEqual(session);
    });

    it('binds auth context to logger', async () => {
      // Create a session
      const createResult = await sessionService.createSession({ userId: testUser.id });
      expect(createResult.isOk()).toBe(true);
      const session = createResult._unsafeUnwrap();

      const middleware = createUserSessionMiddleware({ sessionService });
      const request = createMockRequest({
        [USER_SESSION_COOKIE]: session.id,
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(request.log.child).toHaveBeenCalledWith({
        userId: testUser.id,
        orgId: 'org-1',
      });
    });
  });
});
