import { describe, it, expect } from 'vitest';
import { decideCreateToken } from './decide-create-token.js';
import type { CreateTokenCommand } from './token-commands.js';

const humanCommand = (overrides: Partial<CreateTokenCommand> = {}): CreateTokenCommand => ({
  actor: { kind: 'user', userId: 'user-1', via: 'session' },
  userId: 'user-1',
  organizationId: 'org-1',
  name: 'Lane',
  ...overrides,
});

const input = (
  overrides: Partial<Parameters<typeof decideCreateToken>[0]> = {}
) => ({
  command: humanCommand(),
  tokenCountForUser: 0,
  maxTokensPerUserPerOrg: 2,
  actorRole: 'owner' as const,
  targetKind: 'human' as const,
  id: 'token-1',
  now: '2026-10-09T12:00:00.000Z',
  ...overrides,
});

describe('decideCreateToken', () => {
  it('decides a TokenCreated fact', () => {
    const result = decideCreateToken(input());

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'TokenCreated',
        id: 'token-1',
        userId: 'user-1',
        organizationId: 'org-1',
        name: 'Lane',
        createdAt: '2026-10-09T12:00:00.000Z',
      });
    }
  });

  it('trims the name', () => {
    const result = decideCreateToken(input({ command: humanCommand({ name: '  Lane  ' }) }));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.name).toBe('Lane');
    }
  });

  it('rejects a blank name', () => {
    const result = decideCreateToken(input({ command: humanCommand({ name: '   ' }) }));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_TOKEN_NAME');
    }
  });

  it('rejects when the user is at the token limit', () => {
    const result = decideCreateToken(input({ tokenCountForUser: 2 }));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TOKEN_LIMIT_REACHED');
    }
  });

  it('lets an owner mint a token for an agent member', () => {
    const result = decideCreateToken(
      input({
        command: humanCommand({ userId: 'agent-1' }),
        actorRole: 'owner',
        targetKind: 'agent',
      })
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.userId).toBe('agent-1');
    }
  });

  it('refuses an owner minting a token for another human', () => {
    const result = decideCreateToken(
      input({
        command: humanCommand({ userId: 'polly' }),
        actorRole: 'owner',
        targetKind: 'human',
      })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TOKEN_OWNERSHIP_ERROR');
    }
  });

  it('refuses a bot actor', () => {
    const result = decideCreateToken(
      input({
        command: humanCommand({
          actor: { kind: 'bot', tokenId: 'token-bot', userId: 'user-1', name: 'Lane', via: 'token' },
        }),
      })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
  });

  it('refuses a person token', () => {
    const result = decideCreateToken(
      input({
        command: humanCommand({
          actor: { kind: 'user', userId: 'user-1', via: 'token' },
        }),
      })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
  });
});
