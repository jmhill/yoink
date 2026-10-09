import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import { handleListTokens } from './handle-list-tokens.js';
import type { ApiToken } from '../domain/api-token.js';
import { asTokenName } from '../domain/token-name.js';

describe('handleListTokens', () => {
  it('returns visible tokens with owner, cap, and owned count', async () => {
    const tokens: ApiToken[] = [
      {
        id: 'token-1',
        userId: 'user-1',
        organizationId: 'org-1',
        tokenHash: 'hash',
        name: asTokenName('Lane'),
        lastUsedAt: '2026-10-09T12:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'token-2',
        userId: 'agent-1',
        organizationId: 'org-1',
        tokenHash: 'hash',
        name: asTokenName('Sid'),
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ];

    const result = await handleListTokens(
      {
        actor: { kind: 'user', userId: 'user-1' },
        userId: 'user-1',
        organizationId: 'org-1',
      },
      {
        listOrgTokens: () => okAsync(tokens),
        loadMembership: () => okAsync({ role: 'owner' }),
        loadOwner: (id) =>
          okAsync(
            id === 'agent-1'
              ? { userId: 'agent-1', name: 'Lane', kind: 'agent' }
              : { userId: 'user-1', name: 'Justin', kind: 'human' }
          ),
        maxTokensPerUser: 50,
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.maxTokensPerUser).toBe(50);
      expect(result.value.ownedCount).toBe(1);
      expect(result.value.tokens).toEqual([
        {
          id: 'token-1',
          name: 'Lane',
          lastUsedAt: '2026-10-09T12:00:00.000Z',
          createdAt: '2026-01-01T00:00:00.000Z',
          owner: { userId: 'user-1', name: 'Justin', kind: 'human' },
        },
        {
          id: 'token-2',
          name: 'Sid',
          lastUsedAt: undefined,
          createdAt: '2026-02-01T00:00:00.000Z',
          owner: { userId: 'agent-1', name: 'Lane', kind: 'agent' },
        },
      ]);
    }
  });

  it('hides other humans tokens from a member', async () => {
    const tokens: ApiToken[] = [
      {
        id: 'token-1',
        userId: 'user-1',
        organizationId: 'org-1',
        tokenHash: 'hash',
        name: asTokenName('Mine'),
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'token-2',
        userId: 'agent-1',
        organizationId: 'org-1',
        tokenHash: 'hash',
        name: asTokenName('Lane'),
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ];

    const result = await handleListTokens(
      {
        actor: { kind: 'user', userId: 'user-1' },
        userId: 'user-1',
        organizationId: 'org-1',
      },
      {
        listOrgTokens: () => okAsync(tokens),
        loadMembership: () => okAsync({ role: 'member' }),
        loadOwner: (id) =>
          okAsync(
            id === 'agent-1'
              ? { userId: 'agent-1', name: 'Lane', kind: 'agent' }
              : { userId: 'user-1', name: 'Justin', kind: 'human' }
          ),
        maxTokensPerUser: 50,
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.tokens.map((token) => token.name)).toEqual(['Mine']);
    }
  });
});
