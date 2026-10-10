import { describe, it, expect, beforeEach } from 'vitest';
import { createAgentService, type AgentService } from './agent-service.js';
import { createUserService } from './user-service.js';
import { createMembershipService } from './membership-service.js';
import { createTokenHandlers } from '../application/create-token-handlers.js';
import {
  createStoreBackedTokenCreated,
  createStoreBackedTokenRevoked,
  createStoreBackedTokenReissue,
} from '../infrastructure/store-backed-token-persist.js';
import { handleReissueAgentToken } from '../application/handle-reissue-agent-token.js';
import { tokenStorageError } from './auth-errors.js';
import { principalKindOf } from './user.js';
import { ResultAsync } from 'neverthrow';
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
  let membershipStore: ReturnType<typeof createFakeOrganizationMembershipStore>;
  let tokenStore: ReturnType<typeof createFakeTokenStore>;

  beforeEach(() => {
    userStore = createFakeUserStore({ initialUsers: [owner, member] });
    const organizationStore = createFakeOrganizationStore({ initialOrganizations: [org] });
    membershipStore = createFakeOrganizationMembershipStore({
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
          Promise.resolve(`hashed:${secret}`),
          (error) => tokenStorageError('Failed to hash token secret', error)
        ),
      nextId: () => idGenerator.generate(),
      nextSecret: () => idGenerator.generate(),
      now: () => clock.now().toISOString(),
      maxTokensPerUserPerOrg: 2,
    });

    service = createAgentService({
      userService,
      membershipService,
      createToken: (command) =>
        tokenHandlers.create(command).map(({ token, rawToken }) => ({ token, rawToken })),
      clock,
      idGenerator,
    });
  });

  it('mints an agent member with its own token', async () => {
    const result = await service.mintAgent({
      actor: { kind: 'user', userId: OWNER_ID, via: 'session' },
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
      actor: { kind: 'user', userId: MEMBER_ID, via: 'session' },
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
      actor: { kind: 'user', userId: '550e8400-e29b-41d4-a716-446655440099', via: 'session' },
      organizationId: ORG_ID,
      name: 'Vault bot',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('MEMBERSHIP_NOT_FOUND');
    }
  });

  it('refuses a bot actor before validating the name', async () => {
    const result = await service.mintAgent({
      actor: { kind: 'bot', tokenId: AGENT_TOKEN_ID, userId: OWNER_ID, name: 'Lane', via: 'token' },
      organizationId: ORG_ID,
      name: '   ',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
  });

  it('refuses a person token before creating a member', async () => {
    const membersBefore = await membershipStore.findByOrganizationId(ORG_ID);

    const result = await service.mintAgent({
      actor: { kind: 'user', userId: OWNER_ID, via: 'token' },
      organizationId: ORG_ID,
      name: 'Vault bot',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }

    const membersAfter = await membershipStore.findByOrganizationId(ORG_ID);
    expect(membersAfter._unsafeUnwrap()).toHaveLength(membersBefore._unsafeUnwrap().length);
  });

  it('refuses a bot actor before creating a member', async () => {
    const membersBefore = await membershipStore.findByOrganizationId(ORG_ID);

    const result = await service.mintAgent({
      actor: { kind: 'bot', tokenId: AGENT_TOKEN_ID, userId: OWNER_ID, name: 'Lane', via: 'token' },
      organizationId: ORG_ID,
      name: 'Vault bot',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }

    const membersAfter = await membershipStore.findByOrganizationId(ORG_ID);
    expect(membersAfter._unsafeUnwrap()).toHaveLength(membersBefore._unsafeUnwrap().length);
    expect((await userStore.findById(AGENT_ID))._unsafeUnwrap()).toBeNull();
  });

  it('reissues an agent token without creating a new member', async () => {
    const minted = await service.mintAgent({
      actor: { kind: 'user', userId: OWNER_ID, via: 'session' },
      organizationId: ORG_ID,
      name: 'Tycho',
    });
    expect(minted.isOk()).toBe(true);
    if (!minted.isOk()) return;

    const membersBefore = await membershipStore.findByOrganizationId(ORG_ID);
    const result = await handleReissueAgentToken(
      {
        actor: { kind: 'user', userId: OWNER_ID, via: 'session' },
        organizationId: ORG_ID,
        memberUserId: minted.value.user.id,
      },
      {
        loadMembership: (userId, organizationId) =>
          membershipStore.findByUserAndOrg(userId, organizationId),
        loadUser: (userId) => userStore.findById(userId),
        persistReissue: createStoreBackedTokenReissue(tokenStore),
        hashSecret: (secret) =>
          ResultAsync.fromPromise(
            Promise.resolve(`hashed:${secret}`),
            (error) => tokenStorageError('Failed to hash token secret', error)
          ),
        nextId: () => '550e8400-e29b-41d4-a716-446655440200',
        nextSecret: () => '550e8400-e29b-41d4-a716-446655440201',
        now: () => TEST_DATE.toISOString(),
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.token.name).toBe('Tycho');
      expect(result.value.rawToken).not.toBe(minted.value.rawToken);
    }

    const membersAfter = await membershipStore.findByOrganizationId(ORG_ID);
    expect(membersAfter._unsafeUnwrap()).toHaveLength(membersBefore._unsafeUnwrap().length);
    expect((await userStore.findById(minted.value.user.id))._unsafeUnwrap()?.id).toBe(
      minted.value.user.id
    );

    const active = await tokenStore.findByUserAndOrganization(minted.value.user.id, ORG_ID);
    expect(active._unsafeUnwrap()).toHaveLength(1);
    expect(active._unsafeUnwrap()[0]?.id).not.toBe(minted.value.token.id);
  });
});
