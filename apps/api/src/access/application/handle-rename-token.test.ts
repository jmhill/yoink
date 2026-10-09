import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import { handleRenameToken } from './handle-rename-token.js';
import type { ApiToken } from '../domain/api-token.js';
import type { TokenEvent } from '../domain/token-events.js';

describe('handleRenameToken', () => {
  const unnamed: ApiToken = {
    id: 'token-1',
    userId: 'user-1',
    organizationId: 'org-1',
    tokenHash: 'hash',
    name: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('persists TokenRenamed and returns the named view', async () => {
    const events: TokenEvent[] = [];

    const result = await handleRenameToken(
      {
        actor: { kind: 'user', userId: 'user-1' },
        tokenId: 'token-1',
        userId: 'user-1',
        organizationId: 'org-1',
        name: 'Lane',
      },
      {
        load: () => okAsync(unnamed),
        listOrgTokens: () => okAsync([unnamed]),
        persist: ({ event }) => {
          events.push(event);
          return okAsync(undefined);
        },
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.token.name).toBe('Lane');
    }
    expect(events[0]?.type).toBe('TokenRenamed');
  });
});
