import { describe, it, expect, beforeEach } from 'vitest';
import { seedAuthData } from './seed.js';
import type { Organization } from '../domain/organization.js';
import type { User } from '../domain/user.js';
import type { ApiToken } from '../domain/api-token.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { UserStore } from '../domain/user-store.js';
import type { TokenStore } from '../domain/token-store.js';
import {
  createFakePasswordHasher,
  createFakeClock,
  createFakeIdGenerator,
} from '@yoink/infrastructure';

describe('seedAuthData', () => {
  let savedOrgs: Organization[];
  let savedUsers: User[];
  let savedTokens: ApiToken[];
  let hasTokens: boolean;

  let organizationStore: OrganizationStore;
  let userStore: UserStore;
  let tokenStore: TokenStore;

  beforeEach(() => {
    savedOrgs = [];
    savedUsers = [];
    savedTokens = [];
    hasTokens = false;

    organizationStore = {
      save: async (org) => {
        savedOrgs.push(org);
      },
      findById: async () => null,
    };

    userStore = {
      save: async (user) => {
        savedUsers.push(user);
      },
      findById: async () => null,
    };

    tokenStore = {
      save: async (token) => {
        savedTokens.push(token);
      },
      findById: async () => null,
      updateLastUsed: async () => {},
      hasAnyTokens: async () => hasTokens,
    };
  });

  it('creates org, user, and token when SEED_TOKEN is provided and no tokens exist', async () => {
    await seedAuthData({
      seedToken: 'my-seed-token',
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      idGenerator: createFakeIdGenerator(),
      clock: createFakeClock(new Date('2024-01-01T00:00:00.000Z')),
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
    await seedAuthData({
      seedToken: undefined,
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      idGenerator: createFakeIdGenerator(),
      clock: createFakeClock(new Date('2024-01-01T00:00:00.000Z')),
    });

    expect(savedOrgs).toHaveLength(0);
    expect(savedUsers).toHaveLength(0);
    expect(savedTokens).toHaveLength(0);
  });

  it('does nothing when tokens already exist', async () => {
    hasTokens = true;

    await seedAuthData({
      seedToken: 'my-seed-token',
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      idGenerator: createFakeIdGenerator(),
      clock: createFakeClock(new Date('2024-01-01T00:00:00.000Z')),
    });

    expect(savedOrgs).toHaveLength(0);
    expect(savedUsers).toHaveLength(0);
    expect(savedTokens).toHaveLength(0);
  });

  it('uses the hardcoded organization ID for backward compatibility', async () => {
    await seedAuthData({
      seedToken: 'my-seed-token',
      organizationStore,
      userStore,
      tokenStore,
      passwordHasher: createFakePasswordHasher(),
      idGenerator: createFakeIdGenerator(),
      clock: createFakeClock(new Date('2024-01-01T00:00:00.000Z')),
    });

    expect(savedOrgs[0].id).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(savedUsers[0].id).toBe('550e8400-e29b-41d4-a716-446655440002');
  });
});
