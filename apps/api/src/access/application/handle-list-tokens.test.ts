import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import { handleListTokens } from './handle-list-tokens.js';
import type { ApiToken } from '../domain/api-token.js';

describe('handleListTokens', () => {
  it('returns a complete page with hasMore, nextCursor, and total', async () => {
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
      {
        id: 'token-2',
        userId: 'user-1',
        organizationId: 'org-1',
        tokenHash: 'hash',
        name: null,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ];

    const result = await handleListTokens(
      { userId: 'user-1', organizationId: 'org-1' },
      { listUserOrgTokens: () => okAsync(tokens) }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        tokens: [
          {
            id: 'token-1',
            name: 'Lane',
            lastUsedAt: '2026-10-09T12:00:00.000Z',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'token-2',
            name: null,
            lastUsedAt: undefined,
            createdAt: '2026-02-01T00:00:00.000Z',
          },
        ],
        hasMore: false,
        nextCursor: null,
        total: 2,
      });
    }
  });
});
