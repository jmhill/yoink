import { describe, it, expect } from 'vitest';
import { applyTokenEvent } from './apply-token-event.js';
import { parseTokenName } from './token-name.js';

const name = (raw: string) => {
  const parsed = parseTokenName(raw);
  if (parsed.isErr()) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
};

describe('applyTokenEvent', () => {
  it('projects a created token', () => {
    const view = applyTokenEvent(null, {
      type: 'TokenCreated',
      id: 'token-1',
      userId: 'user-1',
      organizationId: 'org-1',
      name: name('Lane'),
      createdAt: '2026-10-09T12:00:00.000Z',
    });

    expect(view).toEqual({
      id: 'token-1',
      name: 'Lane',
      lastUsedAt: undefined,
      createdAt: '2026-10-09T12:00:00.000Z',
    });
  });

  it('renames an existing view', () => {
    const view = applyTokenEvent(
      {
        id: 'token-1',
        name: null,
        lastUsedAt: undefined,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        type: 'TokenRenamed',
        id: 'token-1',
        userId: 'user-1',
        organizationId: 'org-1',
        name: name('Lane'),
      }
    );

    expect(view).toEqual({
      id: 'token-1',
      name: 'Lane',
      lastUsedAt: undefined,
      createdAt: '2026-01-01T00:00:00.000Z',
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
      }
    );

    expect(view).toBeNull();
  });
});
