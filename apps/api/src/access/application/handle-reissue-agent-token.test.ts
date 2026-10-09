import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { handleReissueAgentToken } from './handle-reissue-agent-token.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { User } from '../domain/user.js';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenEvent } from '../domain/token-events.js';

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
  const events: TokenEvent[] = [];
  return {
    events,
    persistReissue: ({
      revoke,
      create,
    }: {
      revoke: TokenEvent[];
      create: TokenEvent;
      tokenHash: string;
    }) => {
      events.push(...revoke, create);
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
    listMemberTokens: () => okAsync([oldToken]),
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

    const result = await handleReissueAgentToken(
      command,
      deps({
        persistReissue: ({ revoke, create, tokenHash }) => {
          hashed = tokenHash;
          return persistReissue({ revoke, create, tokenHash });
        },
      })
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.token.name).toBe('Tycho');
      expect(result.value.rawToken).toBe('new-token:secret-1');
    }
    expect(hashed).toBe('hashed:secret-1');
    expect(events.map((event) => event.type)).toEqual(['TokenRevoked', 'TokenCreated']);
  });

  it('does not persist when a bot actor calls', async () => {
    const { persistReissue, events } = persistEvents();

    const result = await handleReissueAgentToken(
      {
        ...command,
        actor: { kind: 'bot', tokenId: 'tok', userId: 'owner-1', name: 'Lane' },
      },
      deps({ persistReissue })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
    expect(events).toHaveLength(0);
  });

  it('does not persist when listing tokens fails', async () => {
    const { persistReissue, events } = persistEvents();

    const result = await handleReissueAgentToken(
      command,
      deps({
        listMemberTokens: () => errAsync(tokenStorageError('Find failed')),
        persistReissue,
      })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TOKEN_STORAGE_ERROR');
    }
    expect(events).toHaveLength(0);
  });
});
