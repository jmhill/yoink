import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { handleReissueAgentToken } from './handle-reissue-agent-token.js';
import { createStoreBackedTokenReissue } from '../infrastructure/store-backed-token-persist.js';
import { createFakeTokenStore } from '../infrastructure/fake-token-store.js';
import { membershipStorageError } from '../domain/organization-errors.js';
import { userStorageError } from '../domain/user-errors.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { User } from '../domain/user.js';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenCreated } from '../domain/token-events.js';
import type { ReissueScope } from '../domain/decide-reissue-agent-token.js';

const ownerMembership: OrganizationMembership = {
  id: 'mem-owner',
  userId: 'owner-1',
  organizationId: 'org-1',
  role: 'owner',
  isPersonalOrg: false,
  joinedAt: '2026-01-01T00:00:00.000Z',
};

const agentMembership: OrganizationMembership = {
  id: 'mem-agent',
  userId: 'agent-1',
  organizationId: 'org-1',
  role: 'member',
  isPersonalOrg: false,
  joinedAt: '2026-01-01T00:00:00.000Z',
};

const agent: User = {
  id: 'agent-1',
  email: 'agent-1@yoink.invalid',
  name: 'Tycho',
  kind: 'agent',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const oldToken: ApiToken = {
  id: 'old-token',
  userId: 'agent-1',
  organizationId: 'org-1',
  tokenHash: 'hash',
  name: 'Tycho',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const persistEvents = () => {
  const events: Array<{ type: string }> = [];
  return {
    events,
    persistReissue: ({
      revoke,
      create,
    }: {
      revoke: ReissueScope;
      create: { event: TokenCreated; tokenHash: string };
    }) => {
      events.push({ type: 'TokenRevoked', ...revoke }, create.event);
      return okAsync(undefined);
    },
  };
};

const deps = (
  overrides: Partial<Parameters<typeof handleReissueAgentToken>[1]> = {}
) => {
  const { persistReissue } = persistEvents();
  return {
    loadMembership: (userId: string) =>
      okAsync(userId === 'owner-1' ? ownerMembership : userId === 'agent-1' ? agentMembership : null),
    loadUser: (userId: string) => okAsync(userId === 'agent-1' ? agent : null),
    persistReissue,
    hashSecret: (secret: string) => okAsync(`hashed:${secret}`),
    nextId: () => 'new-token',
    nextSecret: () => 'secret-1',
    now: () => '2026-10-09T12:00:00.000Z',
    ...overrides,
  };
};

const command = {
  actor: { kind: 'user' as const, userId: 'owner-1' },
  organizationId: 'org-1',
  memberUserId: 'agent-1',
};

describe('handleReissueAgentToken', () => {
  it('hashes the secret, persists revoke then create, and returns the raw token once', async () => {
    const { persistReissue, events } = persistEvents();
    let hashed: string | undefined;
    let revokeScope: ReissueScope | undefined;

    const result = await handleReissueAgentToken(
      command,
      deps({
        persistReissue: ({ revoke, create }) => {
          hashed = create.tokenHash;
          revokeScope = revoke;
          return persistReissue({ revoke, create });
        },
      })
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.token.name).toBe('Tycho');
      expect(result.value.rawToken).toBe('new-token:secret-1');
    }
    expect(hashed).toBe('hashed:secret-1');
    expect(revokeScope).toEqual({
      userId: 'agent-1',
      organizationId: 'org-1',
      revokedAt: '2026-10-09T12:00:00.000Z',
    });
    expect(events.map((event) => event.type)).toEqual(['TokenRevoked', 'TokenCreated']);
  });

  it('refuses a bot actor before any reads', async () => {
    let loadMembershipCalls = 0;
    let loadUserCalls = 0;
    const { persistReissue, events } = persistEvents();

    const result = await handleReissueAgentToken(
      {
        ...command,
        actor: { kind: 'bot', tokenId: 'tok', userId: 'owner-1', name: 'Lane' },
      },
      deps({
        loadMembership: () => {
          loadMembershipCalls += 1;
          return errAsync(membershipStorageError('should not load'));
        },
        loadUser: () => {
          loadUserCalls += 1;
          return errAsync(userStorageError('should not load'));
        },
        persistReissue,
      })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
    expect(loadMembershipCalls).toBe(0);
    expect(loadUserCalls).toBe(0);
    expect(events).toHaveLength(0);
  });

  it('returns a typed error when the agent has no name', async () => {
    const { persistReissue, events } = persistEvents();

    const result = await handleReissueAgentToken(
      command,
      deps({
        loadUser: () => okAsync({ ...agent, name: undefined }),
        persistReissue,
      })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_TOKEN_NAME');
    }
    expect(events).toHaveLength(0);
  });

  it('does not persist when loading membership fails', async () => {
    const { persistReissue, events } = persistEvents();

    const result = await handleReissueAgentToken(
      command,
      deps({
        loadMembership: () => errAsync(membershipStorageError('Find failed')),
        persistReissue,
      })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('MEMBERSHIP_STORAGE_ERROR');
    }
    expect(events).toHaveLength(0);
  });

  it('leaves exactly one live token when two reissues run together', async () => {
    const tokenStore = createFakeTokenStore({ initialTokens: [oldToken] });
    const persistReissue = createStoreBackedTokenReissue(tokenStore);
    let next = 0;
    const ids = ['new-token-a', 'new-token-b'];

    const [first, second] = await Promise.all([
      handleReissueAgentToken(
        command,
        deps({
          persistReissue,
          nextId: () => ids[next++] ?? 'new-token-overflow',
          nextSecret: () => `secret-${next}`,
        })
      ),
      handleReissueAgentToken(
        command,
        deps({
          persistReissue,
          nextId: () => ids[next++] ?? 'new-token-overflow',
          nextSecret: () => `secret-${next}`,
        })
      ),
    ]);

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);

    const live = await tokenStore.findByUserAndOrganization('agent-1', 'org-1');
    expect(live.isOk()).toBe(true);
    if (live.isOk()) {
      expect(live.value).toHaveLength(1);
      expect(['new-token-a', 'new-token-b']).toContain(live.value[0]?.id);
    }
  });
});
