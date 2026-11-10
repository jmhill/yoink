import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import { handleListTokens } from './handle-list-tokens.js';
import type { ApiToken } from '../domain/api-token.js';

describe('handleListTokens', () => {
  it('returns the caller own tokens only', async () => {
    const tokens: ApiToken[] = [
      {
        id: 'token-1',
        userId: 'user-1',
        organizationId: 'org-1',
        tokenHash: 'hash',
        name: 'Lane',
        lastUsedAt: '2026-10-09T12:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    let queried: [string, string] | undefined;
    const result = await handleListTokens(
      {
        actor: { kind: 'user', userId: 'user-1', via: 'session' as const },
        userId: 'user-1',
        organizationId: 'org-1',
      },
      {
        listUserOrgTokens: (userId, organizationId) => {
          queried = [userId, organizationId];
          return okAsync(tokens);
        },
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(queried).toEqual(['user-1', 'org-1']);
      expect(result.value.tokens).toEqual([
        {
          id: 'token-1',
          name: 'Lane',
          lastUsedAt: '2026-10-09T12:00:00.000Z',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      expect(JSON.stringify(result.value)).not.toContain('hash');
    }
  });
});
