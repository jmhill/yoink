import { describe, it, expect } from 'vitest';
import { decideCreateToken } from './decide-create-token.js';
import type { CreateNamedTokenCommand } from './token-commands.js';

const humanCommand = (overrides: Partial<CreateNamedTokenCommand> = {}): CreateNamedTokenCommand => ({
  actor: { kind: 'user', userId: 'user-1' },
  userId: 'user-1',
  organizationId: 'org-1',
  name: 'Lane',
  ...overrides,
});

const input = (
  overrides: Partial<Parameters<typeof decideCreateToken>[0]> = {}
) => ({
  command: humanCommand(),
  existingNames: [],
  tokenCountForUser: 0,
  maxTokensPerUserPerOrg: 2,
  id: 'token-1',
  now: '2026-10-09T12:00:00.000Z',
  ...overrides,
});

describe('decideCreateToken', () => {
  it('decides a TokenCreated fact with the parsed name', () => {
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

  it('rejects a name over 200 characters', () => {
    const result = decideCreateToken(
      input({ command: humanCommand({ name: 'a'.repeat(201) }) })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_TOKEN_NAME');
    }
  });

  it('rejects a name already used in the organization ignoring case', () => {
    const result = decideCreateToken(
      input({
        command: humanCommand({ name: 'lane' }),
        existingNames: ['Lane'],
      })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_TOKEN_NAME');
    }
  });

  it('rejects when the user is at the token limit', () => {
    const result = decideCreateToken(input({ tokenCountForUser: 2 }));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TOKEN_LIMIT_REACHED');
    }
  });

  it('refuses a bot actor', () => {
    const result = decideCreateToken(
      input({
        command: humanCommand({
          actor: { kind: 'bot', tokenId: 'token-bot', name: 'Lane' },
        }),
      })
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
  });
});
