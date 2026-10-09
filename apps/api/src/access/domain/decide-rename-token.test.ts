import { describe, it, expect } from 'vitest';
import { decideRenameToken } from './decide-rename-token.js';
import type { ApiToken } from './api-token.js';
import type { RenameTokenCommand } from './token-commands.js';

const unnamed: ApiToken = {
  id: 'token-1',
  userId: 'user-1',
  organizationId: 'org-1',
  tokenHash: 'hash',
  name: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const named: ApiToken = {
  ...unnamed,
  name: 'Lane',
};

const command = (overrides: Partial<RenameTokenCommand> = {}): RenameTokenCommand => ({
  actor: { kind: 'user', userId: 'user-1' },
  tokenId: 'token-1',
  userId: 'user-1',
  organizationId: 'org-1',
  name: 'Charlie',
  ...overrides,
});

describe('decideRenameToken', () => {
  it('names an unnamed token', () => {
    const result = decideRenameToken({
      command: command({ name: 'Lane' }),
      current: unnamed,
      existingNames: [],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'TokenRenamed',
        id: 'token-1',
        userId: 'user-1',
        organizationId: 'org-1',
        name: 'Lane',
      });
    }
  });

  it('allows capitalization-only change of the current name', () => {
    const result = decideRenameToken({
      command: command({ name: 'LANE' }),
      current: named,
      existingNames: ['Lane'],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.name).toBe('LANE');
    }
  });

  it('rejects a name taken by another token ignoring case', () => {
    const result = decideRenameToken({
      command: command({ name: 'charlie' }),
      current: named,
      existingNames: ['Lane', 'Charlie'],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('DUPLICATE_TOKEN_NAME');
    }
  });

  it('rejects a blank name', () => {
    const result = decideRenameToken({
      command: command({ name: '  ' }),
      current: unnamed,
      existingNames: [],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_TOKEN_NAME');
    }
  });

  it('rejects a missing token', () => {
    const result = decideRenameToken({
      command: command(),
      current: null,
      existingNames: [],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('USER_TOKEN_NOT_FOUND');
    }
  });

  it('rejects a token owned by someone else', () => {
    const result = decideRenameToken({
      command: command(),
      current: { ...unnamed, userId: 'other-user' },
      existingNames: [],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TOKEN_OWNERSHIP_ERROR');
    }
  });

  it('refuses a bot actor', () => {
    const result = decideRenameToken({
      command: command({ actor: { kind: 'bot', tokenId: 'token-bot', name: 'Lane' } }),
      current: unnamed,
      existingNames: [],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
  });
});
