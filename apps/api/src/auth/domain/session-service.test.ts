import { describe, it, expect, beforeEach } from 'vitest';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import { createSessionService, type SessionService } from './session-service.js';
import { createMembershipService, type MembershipService } from './membership-service.js';
import type { UserSessionStore } from './user-session-store.js';
import type { UserStore } from './user-store.js';
import type { User } from './user.js';
import type { OrganizationMembership } from './organization-membership.js';
import { createFakeUserSessionStore } from '../infrastructure/fake-user-session-store.js';
import { createFakeUserStore } from '../infrastructure/fake-user-store.js';
import { createFakeOrganizationMembershipStore } from '../infrastructure/fake-organization-membership-store.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';

describe('SessionService', () => {
  let service: SessionService;
  let sessionStore: UserSessionStore;
  let userStore: UserStore;
  let membershipService: MembershipService;
  let clock: ReturnType<typeof createFakeClock>;
  let idGenerator: ReturnType<typeof createFakeIdGenerator>;

  // Test fixtures
  const testUser: User = {
    id: 'user-1',
    organizationId: 'org-1',
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

  const teamOrgMembership: OrganizationMembership = {
    id: 'membership-2',
    userId: 'user-1',
    organizationId: 'org-2',
    role: 'member',
    isPersonalOrg: false,
    joinedAt: '2024-02-01T00:00:00.000Z',
  };

  beforeEach(() => {
    clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    idGenerator = createFakeIdGenerator();
    sessionStore = createFakeUserSessionStore();
    userStore = createFakeUserStore({ initialUsers: [testUser] });

    // Create MembershipService with its dependencies
    const membershipStore = createFakeOrganizationMembershipStore({
      initialMemberships: [personalOrgMembership, teamOrgMembership],
    });
    const organizationStore = createFakeOrganizationStore({
      initialOrganizations: [
        { id: 'org-1', name: 'Personal Org', createdAt: '2024-01-01T00:00:00.000Z' },
        { id: 'org-2', name: 'Team Org', createdAt: '2024-01-01T00:00:00.000Z' },
      ],
    });

    membershipService = createMembershipService({
      membershipStore,
      userStore,
      organizationStore,
      clock,
      idGenerator,
    });

    service = createSessionService({
      sessionStore,
      userStore,
      membershipService,
      clock,
      idGenerator,
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      refreshThresholdMs: 24 * 60 * 60 * 1000, // 1 day
    });
  });

  describe('createSession', () => {
    it('creates a session for a valid user', async () => {
      const result = await service.createSession({ userId: testUser.id });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.userId).toBe(testUser.id);
        expect(result.value.currentOrganizationId).toBe('org-1'); // Personal org first
        expect(result.value.createdAt).toBe('2024-06-15T12:00:00.000Z');
        expect(result.value.expiresAt).toBe('2024-06-22T12:00:00.000Z'); // 7 days later
        expect(result.value.lastActiveAt).toBe('2024-06-15T12:00:00.000Z');
      }
    });

    it('uses specified organization if provided and user is a member', async () => {
      const result = await service.createSession({
        userId: testUser.id,
        organizationId: 'org-2',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.currentOrganizationId).toBe('org-2');
      }
    });

    it('fails if user not found', async () => {
      const result = await service.createSession({ userId: 'non-existent' });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('USER_NOT_FOUND');
      }
    });

    it('fails if user has no memberships', async () => {
      // Create a user with no memberships
      const orphanUser: User = {
        id: 'orphan-user',
        organizationId: 'org-1',
        email: 'orphan@example.com',
        createdAt: '2024-01-01T00:00:00.000Z',
      };
      const orphanUserStore = createFakeUserStore({ initialUsers: [orphanUser] });
      const emptyMembershipStore = createFakeOrganizationMembershipStore({ initialMemberships: [] });
      const organizationStore = createFakeOrganizationStore({
        initialOrganizations: [
          { id: 'org-1', name: 'Org 1', createdAt: '2024-01-01T00:00:00.000Z' },
        ],
      });

      const orphanMembershipService = createMembershipService({
        membershipStore: emptyMembershipStore,
        userStore: orphanUserStore,
        organizationStore,
        clock,
        idGenerator,
      });

      const orphanSessionService = createSessionService({
        sessionStore,
        userStore: orphanUserStore,
        membershipService: orphanMembershipService,
        clock,
        idGenerator,
        sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
        refreshThresholdMs: 24 * 60 * 60 * 1000,
      });

      const result = await orphanSessionService.createSession({ userId: orphanUser.id });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('NO_MEMBERSHIPS');
      }
    });

    it('fails if specified organization is not a membership', async () => {
      const result = await service.createSession({
        userId: testUser.id,
        organizationId: 'org-not-a-member',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('NOT_A_MEMBER');
      }
    });
  });

  describe('validateSession', () => {
    it('returns session if valid and not expired', async () => {
      const createResult = await service.createSession({ userId: testUser.id });
      expect(createResult.isOk()).toBe(true);
      const session = createResult._unsafeUnwrap();

      const result = await service.validateSession(session.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk() && result.value) {
        expect(result.value.userId).toBe(testUser.id);
      }
    });

    it('returns null if session not found', async () => {
      const result = await service.validateSession('non-existent-session-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it('returns null if session is expired', async () => {
      const createResult = await service.createSession({ userId: testUser.id });
      expect(createResult.isOk()).toBe(true);
      const session = createResult._unsafeUnwrap();

      // Advance time past expiry (8 days)
      clock.advanceBy(8 * 24 * 60 * 60 * 1000);

      const result = await service.validateSession(session.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('refreshSession', () => {
    it('updates lastActiveAt if session is within refresh threshold', async () => {
      const createResult = await service.createSession({ userId: testUser.id });
      expect(createResult.isOk()).toBe(true);
      const session = createResult._unsafeUnwrap();

      // Advance time by 2 days (past 1-day refresh threshold)
      clock.advanceBy(2 * 24 * 60 * 60 * 1000);

      const result = await service.refreshSession(session.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true); // Refreshed
      }

      // Verify lastActiveAt was updated
      const validateResult = await service.validateSession(session.id);
      expect(validateResult.isOk()).toBe(true);
      if (validateResult.isOk() && validateResult.value) {
        expect(validateResult.value.lastActiveAt).toBe('2024-06-17T12:00:00.000Z');
      }
    });

    it('returns false if session is recently active (no refresh needed)', async () => {
      const createResult = await service.createSession({ userId: testUser.id });
      expect(createResult.isOk()).toBe(true);
      const session = createResult._unsafeUnwrap();

      // Advance time by only 1 hour (within 1-day refresh threshold)
      clock.advanceBy(60 * 60 * 1000);

      const result = await service.refreshSession(session.id);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false); // No refresh needed
      }
    });

    it('returns false if session not found', async () => {
      const result = await service.refreshSession('non-existent-session-id');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });
  });

  describe('revokeSession', () => {
    it('deletes a session', async () => {
      const createResult = await service.createSession({ userId: testUser.id });
      expect(createResult.isOk()).toBe(true);
      const session = createResult._unsafeUnwrap();

      const revokeResult = await service.revokeSession(session.id);
      expect(revokeResult.isOk()).toBe(true);

      // Session should no longer be valid
      const validateResult = await service.validateSession(session.id);
      expect(validateResult.isOk()).toBe(true);
      if (validateResult.isOk()) {
        expect(validateResult.value).toBeNull();
      }
    });

    it('succeeds even if session does not exist', async () => {
      const result = await service.revokeSession('non-existent-session-id');
      expect(result.isOk()).toBe(true);
    });
  });

  describe('revokeAllUserSessions', () => {
    it('deletes all sessions for a user', async () => {
      // Create multiple sessions
      await service.createSession({ userId: testUser.id });
      idGenerator = createFakeIdGenerator(); // Reset for next ID
      await service.createSession({ userId: testUser.id });

      const revokeResult = await service.revokeAllUserSessions(testUser.id);
      expect(revokeResult.isOk()).toBe(true);

      // All sessions should be gone
      const findResult = await sessionStore.findByUserId(testUser.id);
      expect(findResult.isOk()).toBe(true);
      if (findResult.isOk()) {
        expect(findResult.value).toHaveLength(0);
      }
    });
  });

  describe('switchOrganization', () => {
    it('updates currentOrganizationId for a session', async () => {
      const createResult = await service.createSession({
        userId: testUser.id,
        organizationId: 'org-1',
      });
      expect(createResult.isOk()).toBe(true);
      const session = createResult._unsafeUnwrap();

      const switchResult = await service.switchOrganization(session.id, 'org-2');

      expect(switchResult.isOk()).toBe(true);

      // Verify the org was switched
      const validateResult = await service.validateSession(session.id);
      expect(validateResult.isOk()).toBe(true);
      if (validateResult.isOk() && validateResult.value) {
        expect(validateResult.value.currentOrganizationId).toBe('org-2');
      }
    });

    it('fails if session not found', async () => {
      const result = await service.switchOrganization('non-existent', 'org-2');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('SESSION_NOT_FOUND');
      }
    });

    it('fails if user is not a member of the target organization', async () => {
      const createResult = await service.createSession({ userId: testUser.id });
      expect(createResult.isOk()).toBe(true);
      const session = createResult._unsafeUnwrap();

      const result = await service.switchOrganization(session.id, 'org-not-a-member');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.type).toBe('NOT_A_MEMBER');
      }
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('deletes expired sessions and returns count', async () => {
      // Create a session
      const createResult = await service.createSession({ userId: testUser.id });
      expect(createResult.isOk()).toBe(true);

      // Advance past expiry
      clock.advanceBy(8 * 24 * 60 * 60 * 1000);

      const result = await service.cleanupExpiredSessions();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(1);
      }
    });
  });
});
