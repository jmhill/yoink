import { describe, it, expect, beforeEach } from 'vitest';
import { createAgentService, type AgentService } from './agent-service.js';
import { createUserService } from './user-service.js';
import { createMembershipService } from './membership-service.js';
import { createUserTokenService } from './user-token-service.js';
import { createFakeUserStore } from '../infrastructure/fake-user-store.js';
import { createFakeOrganizationStore } from '../infrastructure/fake-organization-store.js';
import { createFakeOrganizationMembershipStore } from '../infrastructure/fake-organization-membership-store.js';
import { createFakeTokenStore } from '../infrastructure/fake-token-store.js';
import { createFakeClock, createFakeIdGenerator } from '@yoink/infrastructure';
import type { Organization } from './organization.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { User } from './user.js';
import { agentEmailFor } from './user.js';

const TEST_DATE = new Date('2024-01-15T10:00:00.000Z');

const ORG_ID = '550e8400-e29b-41d4-a716-446655440001';
const OWNER_ID = '550e8400-e29b-41d4-a716-446655440010';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440011';
const AGENT_ID = '550e8400-e29b-41d4-a716-446655440100';
const AGENT_MEMBERSHIP_ID = '550e8400-e29b-41d4-a716-446655440101';
const AGENT_TOKEN_ID = '550e8400-e29b-41d4-a716-446655440102';
const AGENT_TOKEN_SECRET = '550e8400-e29b-41d4-a716-446655440103';

const org: Organization = {
  id: ORG_ID,
  name: 'Team Org',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const owner: User = {
  id: OWNER_ID,
  email: 'owner@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const member: User = {
  id: MEMBER_ID,
  email: 'member@example.com',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const ownerMembership: OrganizationMembership = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  userId: OWNER_ID,
  organizationId: ORG_ID,
  role: 'owner',
  isPersonalOrg: true,
  joinedAt: '2024-01-01T00:00:00.000Z',
};

const memberMembership: OrganizationMembership = {
  id: '550e8400-e29b-41d4-a716-446655440021',
  userId: MEMBER_ID,
  organizationId: ORG_ID,
  role: 'member',
  isPersonalOrg: false,
  joinedAt: '2024-01-01T00:00:00.000Z',
};

describe('AgentService', () => {
  let service: AgentService;
  let userStore: ReturnType<typeof createFakeUserStore>;
  let tokenStore: ReturnType<typeof createFakeTokenStore>;

  beforeEach(() => {
    userStore = createFakeUserStore({ initialUsers: [owner, member] });
    const organizationStore = createFakeOrganizationStore({ initialOrganizations: [org] });
    const membershipStore = createFakeOrganizationMembershipStore({
      initialMemberships: [ownerMembership, memberMembership],
    });
    tokenStore = createFakeTokenStore();

    const idGenerator = createFakeIdGenerator([
      AGENT_ID,
      AGENT_MEMBERSHIP_ID,
      AGENT_TOKEN_ID,
      AGENT_TOKEN_SECRET,
    ]);
    const clock = createFakeClock(TEST_DATE);
    const userService = createUserService({ userStore });
    const membershipService = createMembershipService({
      membershipStore,
      userService,
      organizationStore,
      clock,
      idGenerator,
    });
    const userTokenService = createUserTokenService({
      tokenStore,
      clock,
      idGenerator,
      passwordHasher: {
        hash: async (password: string) => `hashed:${password}`,
        compare: async (password: string, hash: string) => hash === `hashed:${password}`,
      },
      maxTokensPerUserPerOrg: 2,
    });

    service = createAgentService({
      userService,
      membershipService,
      userTokenService,
      clock,
      idGenerator,
    });
  });

  it('mints an agent member with its own token', async () => {
    const result = await service.mintAgent({
      actorUserId: OWNER_ID,
      organizationId: ORG_ID,
      name: 'Vault bot',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.user).toEqual({
        id: AGENT_ID,
        email: agentEmailFor(AGENT_ID),
        name: 'Vault bot',
        kind: 'agent',
        createdAt: TEST_DATE.toISOString(),
      });
      expect(result.value.membership).toMatchObject({
        userId: AGENT_ID,
        organizationId: ORG_ID,
        role: 'member',
        isPersonalOrg: false,
      });
      expect(result.value.token.name).toBe('Vault bot');
      expect(result.value.rawToken).toBe(`${AGENT_TOKEN_ID}:${AGENT_TOKEN_SECRET}`);
    }

    const ownerTokens = await tokenStore.findByUserAndOrganization(OWNER_ID, ORG_ID);
    expect(ownerTokens.isOk() && ownerTokens.value).toHaveLength(0);
  });

  it('rejects minting when the actor is a regular member', async () => {
    const result = await service.mintAgent({
      actorUserId: MEMBER_ID,
      organizationId: ORG_ID,
      name: 'Vault bot',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INSUFFICIENT_PERMISSIONS');
    }
  });

  it('rejects minting when the actor is not a member', async () => {
    const result = await service.mintAgent({
      actorUserId: '550e8400-e29b-41d4-a716-446655440099',
      organizationId: ORG_ID,
      name: 'Vault bot',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('MEMBERSHIP_NOT_FOUND');
    }
  });
});
