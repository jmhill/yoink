import { describe, it, expect } from 'vitest';
import { decideRevokeToken } from './decide-revoke-token.js';
import type { ApiToken } from './api-token.js';
import type { RevokeTokenCommand } from './token-commands.js';

const token: ApiToken = {
  id: 'token-1',
  userId: 'user-1',
  organizationId: 'org-1',
  tokenHash: 'hash',
  name: 'Lane',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const command = (overrides: Partial<RevokeTokenCommand> = {}): RevokeTokenCommand => ({
  actor: { kind: 'user', userId: 'user-1' },
  tokenId: 'token-1',
  userId: 'user-1',
  ...overrides,
});

describe('decideRevokeToken', () => {
  it('decides a TokenRevoked fact for the owner', () => {
    const result = decideRevokeToken({ command: command(), current: token });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'TokenRevoked',
        id: 'token-1',
        userId: 'user-1',
      });
    }
  });

  it('rejects a missing token', () => {
    const result = decideRevokeToken({ command: command(), current: null });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('USER_TOKEN_NOT_FOUND');
    }
  });

  it('rejects a token owned by someone else', () => {
    const result = decideRevokeToken({
      command: command(),
      current: { ...token, userId: 'other-user' },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TOKEN_OWNERSHIP_ERROR');
    }
  });

  it('refuses a bot actor', () => {
    const result = decideRevokeToken({
      command: command({ actor: { kind: 'bot', tokenId: 'token-bot', name: 'Lane' } }),
      current: token,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
  });
});
