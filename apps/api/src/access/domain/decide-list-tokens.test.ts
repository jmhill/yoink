import { describe, expect, it } from 'vitest';
import type { ApiToken } from './api-token.js';
import { decideTokenList } from './decide-list-tokens.js';

const token = (overrides: Partial<ApiToken> = {}): ApiToken => ({
  id: 'token-1',
  userId: 'user-1',
  organizationId: 'org-1',
  tokenHash: 'hash-1',
  name: 'Lane',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('decideTokenList', () => {
  it('keeps a sibling token and returns metadata only', () => {
    const result = decideTokenList([
      token(),
      token({ id: 'token-2', name: 'Sibling', tokenHash: 'hash-2' }),
    ]);

    expect(result.tokens).toEqual([
      {
        id: 'token-1',
        name: 'Lane',
        lastUsedAt: undefined,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'token-2',
        name: 'Sibling',
        lastUsedAt: undefined,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('hash-');
    expect(JSON.stringify(result)).not.toContain('tokenHash');
  });

  it('drops a revoked token', () => {
    const result = decideTokenList([
      token({ id: 'token-live', name: 'Live' }),
      token({ id: 'token-dead', revokedAt: '2026-02-01T00:00:00.000Z' }),
    ]);

    expect(result.tokens.map((item) => item.id)).toEqual(['token-live']);
  });
});
