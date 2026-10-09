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
  organizationId: 'org-1',
  ...overrides,
});

const decide = (
  overrides: Partial<Parameters<typeof decideRevokeToken>[0]> = {}
) =>
  decideRevokeToken({
    command: command(),
    current: token,
    now: '2026-10-09T12:00:00.000Z',
    ...overrides,
  });

describe('decideRevokeToken', () => {
  it('decides a TokenRevoked fact for the owner', () => {
    const result = decide();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        type: 'TokenRevoked',
        id: 'token-1',
        userId: 'user-1',
        organizationId: 'org-1',
        revokedAt: '2026-10-09T12:00:00.000Z',
      });
    }
  });

  it('rejects a missing token', () => {
    const result = decide({ current: null });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('USER_TOKEN_NOT_FOUND');
    }
  });

  it('rejects a token in another organization as not found', () => {
    const result = decide({
      current: { ...token, organizationId: 'org-other' },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('USER_TOKEN_NOT_FOUND');
    }
  });

  it('rejects a token owned by someone else', () => {
    const result = decide({
      current: { ...token, userId: 'other-user' },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TOKEN_OWNERSHIP_ERROR');
    }
  });

  it('refuses an owner revoking an agent token', () => {
    const result = decide({
      command: command({ actor: { kind: 'user', userId: 'owner-1' } }),
      current: { ...token, userId: 'agent-1' },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('TOKEN_OWNERSHIP_ERROR');
    }
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
