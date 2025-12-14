import { describe, it, expect, beforeEach } from 'vitest';
import { seedAuthData } from './seed.js';
import { createFakeOrganizationStore } from './fake-organization-store.js';
import { createFakeUserStore } from './fake-user-store.js';
import { createFakeTokenStore } from './fake-token-store.js';
import type { Organization } from '../domain/organization.js';
import type { User } from '../domain/user.js';
import type { ApiToken } from '../domain/api-token.js';
import {
  createFakePasswordHasher,
  createFakeClock,
  createFakeIdGenerator,
} from '@yoink/infrastructure';

describe('seedAuthData', () => {
  let savedOrgs: Organization[];
  let savedUsers: User[];
  let savedTokens: ApiToken[];

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

  beforeEach(() => {
    savedOrgs = [];
    savedUsers = [];
    savedTokens = [];
  });

  it('creates org, user, and token when SEED_TOKEN is provided and no tokens exist', async () => {
    const organizationStore = createTrackingOrganizationStore();
    const userStore = createTrackingUserStore();
    const tokenStore = createTrackingTokenStore();

    await seedAuthData({
      seedToken: 'my-seed-token',
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      idGenerator: createFakeIdGenerator(),
      clock: createFakeClock(new Date('2024-01-01T00:00:00.000Z')),
      silent: true,
    });

    expect(savedOrgs).toHaveLength(1);
    expect(savedOrgs[0].name).toBe('My Captures');

    expect(savedUsers).toHaveLength(1);
    expect(savedUsers[0].organizationId).toBe(savedOrgs[0].id);
    expect(savedUsers[0].email).toBe('seed@localhost');

    expect(savedTokens).toHaveLength(1);
    expect(savedTokens[0].userId).toBe(savedUsers[0].id);
    expect(savedTokens[0].tokenHash).toBe('fake-hash:my-seed-token');
    expect(savedTokens[0].name).toBe('seed-token');
  });

  it('does nothing when SEED_TOKEN is not provided', async () => {
    const organizationStore = createTrackingOrganizationStore();
    const userStore = createTrackingUserStore();
    const tokenStore = createTrackingTokenStore();

    await seedAuthData({
      seedToken: undefined,
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      idGenerator: createFakeIdGenerator(),
      clock: createFakeClock(new Date('2024-01-01T00:00:00.000Z')),
      silent: true,
    });

    expect(savedOrgs).toHaveLength(0);
    expect(savedUsers).toHaveLength(0);
    expect(savedTokens).toHaveLength(0);
  });

  it('does nothing when tokens already exist', async () => {
    const existingToken: ApiToken = {
      id: 'existing-token',
      userId: 'existing-user',
      tokenHash: 'hash',
      name: 'existing',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const organizationStore = createTrackingOrganizationStore();
    const userStore = createTrackingUserStore();
    const tokenStore = createTrackingTokenStore([existingToken]);

    // Reset after creating stores (creating stores adds initial items to tracking arrays)
    savedOrgs = [];
    savedUsers = [];
    savedTokens = [];

    await seedAuthData({
      seedToken: 'my-seed-token',
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      idGenerator: createFakeIdGenerator(),
      clock: createFakeClock(new Date('2024-01-01T00:00:00.000Z')),
      silent: true,
    });

    expect(savedOrgs).toHaveLength(0);
    expect(savedUsers).toHaveLength(0);
    expect(savedTokens).toHaveLength(0);
  });

  it('uses the hardcoded organization ID for backward compatibility', async () => {
    const organizationStore = createTrackingOrganizationStore();
    const userStore = createTrackingUserStore();
    const tokenStore = createTrackingTokenStore();

    await seedAuthData({
      seedToken: 'my-seed-token',
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      idGenerator: createFakeIdGenerator(),
      clock: createFakeClock(new Date('2024-01-01T00:00:00.000Z')),
      silent: true,
    });

    expect(savedOrgs[0].id).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(savedUsers[0].id).toBe('550e8400-e29b-41d4-a716-446655440002');
  });
});
