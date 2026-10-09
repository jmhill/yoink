import { describe, it, expect } from 'vitest';
import { decideReissueAgentToken } from './decide-reissue-agent-token.js';
import type { ReissueAgentTokenCommand } from './token-commands.js';

const command = (
  overrides: Partial<ReissueAgentTokenCommand> = {}
): ReissueAgentTokenCommand => ({
  actor: { kind: 'user', userId: 'owner-1' },
  organizationId: 'org-1',
  memberUserId: 'agent-1',
  ...overrides,
});

const input = (
  overrides: Partial<Parameters<typeof decideReissueAgentToken>[0]> = {}
) =>
  decideReissueAgentToken({
    command: command(),
    actorRole: 'owner',
    targetMembership: { userId: 'agent-1', organizationId: 'org-1' },
    targetKind: 'agent',
    tokenName: 'Tycho',
    newTokenId: 'new-token',
    now: '2026-10-09T12:00:00.000Z',
    ...overrides,
  });

describe('decideReissueAgentToken', () => {
  it('revokes every live token for the user and org, then creates one', () => {
    const result = input();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.revoke).toEqual({
        userId: 'agent-1',
        organizationId: 'org-1',
        revokedAt: '2026-10-09T12:00:00.000Z',
      });
      expect(result.value.create).toEqual({
        type: 'TokenCreated',
        id: 'new-token',
        userId: 'agent-1',
        organizationId: 'org-1',
        name: 'Tycho',
        createdAt: '2026-10-09T12:00:00.000Z',
      });
    }
  });

  it('refuses a blank agent name', () => {
    const result = input({ tokenName: '   ' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_TOKEN_NAME');
    }
  });

  it('refuses a bot actor', () => {
    const result = input({
      command: command({
        actor: { kind: 'bot', tokenId: 'tok', userId: 'owner-1', name: 'Lane' },
      }),
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('BOT_CANNOT_MANAGE_TOKENS');
    }
  });

  it('refuses a non-owner human', () => {
    const result = input({ actorRole: 'admin' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INSUFFICIENT_PERMISSIONS');
    }
  });

  it('refuses a human member target', () => {
    const result = input({
      command: command({ memberUserId: 'human-1' }),
      targetMembership: { userId: 'human-1', organizationId: 'org-1' },
      targetKind: 'human',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('MEMBERSHIP_NOT_FOUND');
    }
  });

  it('refuses a target in another organization', () => {
    const result = input({ targetMembership: null, targetKind: 'agent' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('MEMBERSHIP_NOT_FOUND');
    }
  });
});
