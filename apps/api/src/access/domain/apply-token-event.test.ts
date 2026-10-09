import { describe, it, expect } from 'vitest';
import { applyTokenEvent } from './apply-token-event.js';

describe('applyTokenEvent', () => {
  it('projects a created token', () => {
    const view = applyTokenEvent(null, {
      type: 'TokenCreated',
      id: 'token-1',
      userId: 'user-1',
      organizationId: 'org-1',
      name: 'Lane',
      createdAt: '2026-10-09T12:00:00.000Z',
    });

    expect(view).toEqual({
      id: 'token-1',
      name: 'Lane',
      lastUsedAt: undefined,
      createdAt: '2026-10-09T12:00:00.000Z',
    });
  });

  it('revokes to null', () => {
    const view = applyTokenEvent(
      {
        id: 'token-1',
        name: 'Lane',
        lastUsedAt: undefined,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        type: 'TokenRevoked',
        id: 'token-1',
        userId: 'user-1',
        organizationId: 'org-1',
        revokedAt: '2026-10-09T12:00:00.000Z',
      }
    );

    expect(view).toBeNull();
  });
});
