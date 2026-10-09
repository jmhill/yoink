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

const decide = (
  overrides: Partial<Parameters<typeof decideRenameToken>[0]> = {}
) =>
  decideRenameToken({
    command: command(),
    current: unnamed,
    existingNames: [],
    actorRole: 'member',
    tokenOwnerKind: 'human',
    ...overrides,
  });

describe('decideRenameToken', () => {
  it('names an unnamed token', () => {
    const result = decide({
      command: command({ name: 'Lane' }),
      current: unnamed,
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
    const result = decide({
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
    const result = decide({
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
    const result = decide({
      command: command({ name: '  ' }),
      current: unnamed,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_TOKEN_NAME');
    }
  });

  it('rejects a missing token', () => {
    const result = decide({ current: null });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('USER_TOKEN_NOT_FOUND');
    }
  });

  it('rejects a token in another organization', () => {
    const result = decide({
      current: { ...unnamed, organizationId: 'org-other' },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('USER_TOKEN_NOT_FOUND');
    }
  });

  it('rejects a revoked token as not found', () => {
    const result = decide({
      current: { ...unnamed, revokedAt: '2026-10-01T00:00:00.000Z' },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('USER_TOKEN_NOT_FOUND');
    }
  });

  it('rejects a member renaming someone else token', () => {
    const result = decide({
      current: { ...unnamed, userId: 'other-user' },
      actorRole: 'member',
      tokenOwnerKind: 'human',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TOKEN_OWNERSHIP_ERROR');
    }
  });

  it('lets an owner rename an agent token', () => {
    const result = decide({
      command: command({ name: 'Lane' }),
      current: { ...unnamed, userId: 'agent-1' },
      actorRole: 'owner',
      tokenOwnerKind: 'agent',
    });

    expect(result.isOk()).toBe(true);
  });

  it('refuses a bot actor', () => {
    const result = decide({
      command: command({
        actor: { kind: 'bot', tokenId: 'token-bot', userId: 'user-1', name: 'Lane' },
      }),
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
  });
});
