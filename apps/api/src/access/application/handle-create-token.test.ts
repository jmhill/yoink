import { describe, it, expect } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { handleCreateToken } from './handle-create-token.js';
import { tokenStorageError } from '../domain/auth-errors.js';
import type { TokenEvent } from '../domain/token-events.js';

const persistEvents = () => {
  const events: TokenEvent[] = [];
  return {
    events,
    persistCreate: ({ event }: { event: TokenEvent; tokenHash: string }) => {
      events.push(event);
      return okAsync(undefined);
    },
  };
};

const owner = {
  userId: 'user-1',
  kind: 'human' as const,
};

const deps = (
  overrides: Omit<Partial<Parameters<typeof handleCreateToken>[1]>, 'persistCreate'> & {
    persistCreate: Parameters<typeof handleCreateToken>[1]['persistCreate'];
  }
) => ({
  listUserOrgTokens: () => okAsync([]),
  loadMembership: () => okAsync({ role: 'owner' as const }),
  loadOwner: () => okAsync(owner),
  hashSecret: (secret: string) => okAsync(`hashed:${secret}`),
  nextId: () => 'token-1',
  nextSecret: () => 'secret-1',
  now: () => '2026-10-09T12:00:00.000Z',
  maxTokensPerUserPerOrg: 2,
  ...overrides,
});

describe('handleCreateToken', () => {
  const command = {
    actor: { kind: 'user' as const, userId: 'user-1', via: 'session' },
    userId: 'user-1',
    organizationId: 'org-1',
    name: 'Lane',
  };

  it('hashes the secret, persists TokenCreated, and returns rawToken without logging it', async () => {
    const { persistCreate, events } = persistEvents();
    let hashed: string | undefined;

    const result = await handleCreateToken(command, deps({
      persistCreate: ({ event, tokenHash }) => {
        hashed = tokenHash;
        return persistCreate({ event, tokenHash });
      },
    }));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.token.name).toBe('Lane');
      expect(result.value.rawToken).toBe('token-1:secret-1');
    }
    expect(hashed).toBe('hashed:secret-1');
    expect(events[0]?.type).toBe('TokenCreated');
  });

  it('does not persist when a bot actor calls', async () => {
    const { persistCreate, events } = persistEvents();

    const result = await handleCreateToken(
      { ...command, actor: { kind: 'bot', tokenId: 'token-bot', userId: 'user-1', name: 'Lane', via: 'token' } },
      deps({ persistCreate })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
    expect(events).toHaveLength(0);
  });

  it('does not persist when a person token calls', async () => {
    const { persistCreate, events } = persistEvents();

    const result = await handleCreateToken(
      { ...command, actor: { kind: 'user' as const, userId: 'user-1', via: 'token' as const } },
      deps({ persistCreate })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
    expect(events).toHaveLength(0);
  });

  it('returns storage error when listing fails', async () => {
    const { persistCreate, events } = persistEvents();

    const result = await handleCreateToken(command, deps({
      listUserOrgTokens: () => errAsync(tokenStorageError('Find failed')),
      persistCreate,
    }));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TOKEN_STORAGE_ERROR');
    }
    expect(events).toHaveLength(0);
  });
});
