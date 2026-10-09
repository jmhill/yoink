import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { handleCreateToken } from './handle-create-token.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import type { ApiToken } from '../domain/api-token.js';
import { asTokenName } from '../domain/token-name.js';
import type { TokenEvent } from '../domain/token-events.js';

const persistEvents = () => {
  const events: TokenEvent[] = [];
  return {
    events,
    persist: ({ event }: { event: TokenEvent; tokenHash?: string }) => {
      events.push(event);
      return okAsync(undefined);
    },
  };
};

const owner = {
  userId: 'user-1',
  name: 'Justin',
  kind: 'human' as const,
};

const deps = (
  overrides: Omit<Partial<Parameters<typeof handleCreateToken>[1]>, 'persist'> & {
    persist: Parameters<typeof handleCreateToken>[1]['persist'];
  }
) => ({
  listOrgTokens: () => okAsync([]),
  loadMembership: () => okAsync({ role: 'owner' as const }),
  loadOwner: () => okAsync(owner),
  hashSecret: (secret: string) => okAsync(`hashed:${secret}`),
  nextId: () => 'token-1',
  nextSecret: () => 'secret-1',
  now: () => '2026-10-09T12:00:00.000Z',
  maxTokensPerUserPerOrg: 50,
  ...overrides,
});

describe('handleCreateToken', () => {
  const command = {
    actor: { kind: 'user' as const, userId: 'user-1' },
    userId: 'user-1',
    organizationId: 'org-1',
    name: 'Lane',
  };

  it('hashes the secret, persists TokenCreated, and returns rawToken without logging it', async () => {
    const { persist, events } = persistEvents();
    let hashed: string | undefined;

    const result = await handleCreateToken(command, deps({
      persist: ({ event, tokenHash }) => {
        hashed = tokenHash;
        return persist({ event, tokenHash });
      },
    }));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.token.name).toBe('Lane');
      expect(result.value.token.owner).toEqual(owner);
      expect(result.value.rawToken).toBe('token-1:secret-1');
    }
    expect(hashed).toBe('hashed:secret-1');
    expect(events[0]?.type).toBe('TokenCreated');
  });

  it('does not persist when a bot actor calls', async () => {
    const { persist, events } = persistEvents();

    const result = await handleCreateToken(
      { ...command, actor: { kind: 'bot', tokenId: 'token-bot', userId: 'user-1', name: 'Lane' } },
      deps({ persist })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
    expect(events).toHaveLength(0);
  });

  it('does not persist a duplicate name', async () => {
    const { persist, events } = persistEvents();
    const existing: ApiToken = {
      id: 'token-existing',
      userId: 'user-2',
      organizationId: 'org-1',
      tokenHash: 'hash',
      name: asTokenName('Lane'),
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    const result = await handleCreateToken(command, deps({
      listOrgTokens: () => okAsync([existing]),
      persist,
    }));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_TOKEN_NAME');
    }
    expect(events).toHaveLength(0);
  });

  it('returns storage error when listing fails', async () => {
    const { persist, events } = persistEvents();

    const result = await handleCreateToken(command, deps({
      listOrgTokens: () => errAsync(tokenStorageError('Find failed')),
      persist,
    }));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TOKEN_STORAGE_ERROR');
    }
    expect(events).toHaveLength(0);
  });
});
