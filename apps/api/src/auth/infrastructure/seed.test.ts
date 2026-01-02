import { describe, it, expect, beforeEach } from 'vitest';
import { seedAuthData } from './seed.js';
import { createFakeOrganizationStore } from '../../organizations/infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../../organizations/infrastructure/fake-organization-membership-store.js';
import { createFakeInvitationStore } from '../../organizations/infrastructure/fake-invitation-store.js';
import { createFakeUserStore } from '../../users/infrastructure/fake-user-store.js';
import { createFakeTokenStore } from './fake-token-store.js';
import type { Organization } from '../../organizations/domain/organization.js';
import type { OrganizationMembership } from '../../organizations/domain/organization-membership.js';
import type { Invitation } from '../../organizations/domain/invitation.js';
import type { User } from '../../users/domain/user.js';
import type { ApiToken } from '../domain/api-token.js';
import {
  createFakePasswordHasher,
  createFakeClock,
  createFakeIdGenerator,
  createCodeGenerator,
} from '@yoink/infrastructure';

describe('seedAuthData', () => {
  let savedOrgs: Organization[];
  let savedUsers: User[];
  let savedTokens: ApiToken[];
  let savedMemberships: OrganizationMembership[];
  let savedInvitations: Invitation[];

  // Helper to create stores that track saved items
  const createTrackingOrganizationStore = (initialOrganizations: Organization[] = []) => {
    savedOrgs = [...initialOrganizations];
    const store = createFakeOrganizationStore({ initialOrganizations });
    const originalSave = store.save.bind(store);
    return {
      ...store,
      save: (org: Organization) => {
        savedOrgs.push(org);
        return originalSave(org);
      },
    };
  };

  const createTrackingUserStore = (initialUsers: User[] = []) => {
    savedUsers = [...initialUsers];
    const store = createFakeUserStore({ initialUsers });
    const originalSave = store.save.bind(store);
    return {
      ...store,
      save: (user: User) => {
        savedUsers.push(user);
        return originalSave(user);
      },
    };
  };

  const createTrackingTokenStore = (initialTokens: ApiToken[] = []) => {
    savedTokens = [...initialTokens];
    const store = createFakeTokenStore({ initialTokens });
    const originalSave = store.save.bind(store);
    return {
      ...store,
      save: (token: ApiToken) => {
        savedTokens.push(token);
        return originalSave(token);
      },
    };
  };

  const createTrackingMembershipStore = (initialMemberships: OrganizationMembership[] = []) => {
    savedMemberships = [...initialMemberships];
    const store = createFakeOrganizationMembershipStore({ initialMemberships });
    const originalSave = store.save.bind(store);
    return {
      ...store,
      save: (membership: OrganizationMembership) => {
        savedMemberships.push(membership);
        return originalSave(membership);
      },
    };
  };

  const createTrackingInvitationStore = (initialInvitations: Invitation[] = []) => {
    savedInvitations = [...initialInvitations];
    const store = createFakeInvitationStore({ initialInvitations });
    const originalSave = store.save.bind(store);
    return {
      ...store,
      save: (invitation: Invitation) => {
        savedInvitations.push(invitation);
        return originalSave(invitation);
      },
    };
  };

  beforeEach(() => {
    savedOrgs = [];
    savedUsers = [];
    savedTokens = [];
    savedMemberships = [];
    savedInvitations = [];
  });

  it('creates org, user, membership, and token when SEED_TOKEN is provided and no tokens exist', async () => {
    const organizationStore = createTrackingOrganizationStore();
    const userStore = createTrackingUserStore();
    const tokenStore = createTrackingTokenStore();
    const membershipStore = createTrackingMembershipStore();
    const invitationStore = createTrackingInvitationStore();

    await seedAuthData({
      seedToken: 'my-seed-token',
      seedInvitationEmail: undefined,
      organizationStore,
      userStore,
      tokenStore,
      membershipStore,
      invitationStore,
      passwordHasher: createFakePasswordHasher(),
      idGenerator: createFakeIdGenerator(),
      codeGenerator: createCodeGenerator(),
      clock: createFakeClock(new Date('2024-01-01T00:00:00.000Z')),
      silent: true,
    });

    expect(savedOrgs).toHaveLength(1);
    expect(savedOrgs[0].name).toBe('My Captures');

    expect(savedUsers).toHaveLength(1);
    expect(savedUsers[0].organizationId).toBe(savedOrgs[0].id);
    expect(savedUsers[0].email).toBe('seed@localhost');

    expect(savedMemberships).toHaveLength(1);
    expect(savedMemberships[0].userId).toBe(savedUsers[0].id);
    expect(savedMemberships[0].organizationId).toBe(savedOrgs[0].id);
    expect(savedMemberships[0].role).toBe('owner');
    expect(savedMemberships[0].isPersonalOrg).toBe(true);

    expect(savedTokens).toHaveLength(1);
    expect(savedTokens[0].userId).toBe(savedUsers[0].id);
    expect(savedTokens[0].organizationId).toBe(savedOrgs[0].id);
    expect(savedTokens[0].tokenHash).toBe('fake-hash:my-seed-token');
    expect(savedTokens[0].name).toBe('seed-token');

    expect(savedInvitations).toHaveLength(0);
  });

  it('does nothing when SEED_TOKEN is not provided', async () => {
    const organizationStore = createTrackingOrganizationStore();
    const userStore = createTrackingUserStore();
    const tokenStore = createTrackingTokenStore();
    const membershipStore = createTrackingMembershipStore();
    const invitationStore = createTrackingInvitationStore();

    await seedAuthData({
      seedToken: undefined,
      seedInvitationEmail: undefined,
      organizationStore,
      userStore,
      tokenStore,
      membershipStore,
      invitationStore,
      passwordHasher: createFakePasswordHasher(),
      idGenerator: createFakeIdGenerator(),
      codeGenerator: createCodeGenerator(),
      clock: createFakeClock(new Date('2024-01-01T00:00:00.000Z')),
      silent: true,
    });

    expect(savedOrgs).toHaveLength(0);
    expect(savedUsers).toHaveLength(0);
    expect(savedTokens).toHaveLength(0);
    expect(savedMemberships).toHaveLength(0);
    expect(savedInvitations).toHaveLength(0);
  });

  it('does nothing when tokens already exist', async () => {
    const existingToken: ApiToken = {
      id: 'existing-token',
      userId: 'existing-user',
      organizationId: 'existing-org',
      tokenHash: 'hash',
      name: 'existing',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const organizationStore = createTrackingOrganizationStore();
    const userStore = createTrackingUserStore();
    const tokenStore = createTrackingTokenStore([existingToken]);
    const membershipStore = createTrackingMembershipStore();
    const invitationStore = createTrackingInvitationStore();

    // Reset after creating stores (creating stores adds initial items to tracking arrays)
    savedOrgs = [];
    savedUsers = [];
    savedTokens = [];
    savedMemberships = [];
    savedInvitations = [];

    await seedAuthData({
      seedToken: 'my-seed-token',
      seedInvitationEmail: undefined,
      organizationStore,
      userStore,
      tokenStore,
      membershipStore,
      invitationStore,
      passwordHasher: createFakePasswordHasher(),
      idGenerator: createFakeIdGenerator(),
      codeGenerator: createCodeGenerator(),
      clock: createFakeClock(new Date('2024-01-01T00:00:00.000Z')),
      silent: true,
    });

    expect(savedOrgs).toHaveLength(0);
    expect(savedUsers).toHaveLength(0);
    expect(savedTokens).toHaveLength(0);
    expect(savedMemberships).toHaveLength(0);
    expect(savedInvitations).toHaveLength(0);
  });

  it('uses the hardcoded organization ID for backward compatibility', async () => {
    const organizationStore = createTrackingOrganizationStore();
    const userStore = createTrackingUserStore();
    const tokenStore = createTrackingTokenStore();
    const membershipStore = createTrackingMembershipStore();
    const invitationStore = createTrackingInvitationStore();

    await seedAuthData({
      seedToken: 'my-seed-token',
      seedInvitationEmail: undefined,
      organizationStore,
      userStore,
      tokenStore,
      membershipStore,
      invitationStore,
      passwordHasher: createFakePasswordHasher(),
      idGenerator: createFakeIdGenerator(),
      codeGenerator: createCodeGenerator(),
      clock: createFakeClock(new Date('2024-01-01T00:00:00.000Z')),
      silent: true,
    });

    expect(savedOrgs[0].id).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(savedUsers[0].id).toBe('550e8400-e29b-41d4-a716-446655440002');
  });

  it('creates invitation when seedInvitationEmail is provided', async () => {
    const organizationStore = createTrackingOrganizationStore();
    const userStore = createTrackingUserStore();
    const tokenStore = createTrackingTokenStore();
    const membershipStore = createTrackingMembershipStore();
    const invitationStore = createTrackingInvitationStore();

    const result = await seedAuthData({
      seedToken: 'my-seed-token',
      seedInvitationEmail: 'dev@localhost',
      organizationStore,
      userStore,
      tokenStore,
      membershipStore,
      invitationStore,
      passwordHasher: createFakePasswordHasher(),
      idGenerator: createFakeIdGenerator(),
      codeGenerator: createCodeGenerator(),
      clock: createFakeClock(new Date('2024-01-01T00:00:00.000Z')),
      silent: true,
    });

    expect(savedInvitations).toHaveLength(1);
    expect(savedInvitations[0].email).toBe('dev@localhost');
    expect(savedInvitations[0].code).toBe('DEVLOCAL');
    expect(savedInvitations[0].role).toBe('member');
    expect(savedInvitations[0].organizationId).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(result.invitationCode).toBe('DEVLOCAL');
  });
});
