import { describe, it, expect } from 'vitest';
import { decodeKeysetCursor, encodeKeysetCursor } from './keyset-codec.js';

describe('keyset cursor codec', () => {
  it('round-trips a view-tagged cursor through base64url', () => {
    const encoded = encodeKeysetCursor({
      view: 'tasks.completed',
      keys: ['2025-01-15T11:00:00.000Z', 'done-1'],
    });
    const decoded = decodeKeysetCursor(encoded, 'tasks.completed');
    expect(decoded.isOk()).toBe(true);
    if (decoded.isOk()) {
      expect(decoded.value).toEqual({
        view: 'tasks.completed',
        keys: ['2025-01-15T11:00:00.000Z', 'done-1'],
      });
    }
  });

  it('rejects a malformed string', () => {
    const decoded = decodeKeysetCursor('not-a-cursor', 'tasks.board');
    expect(decoded.isErr()).toBe(true);
    if (decoded.isErr()) {
      expect(decoded.error.type).toBe('INVALID_CURSOR');
    }
  });

  it('rejects a cursor for a different view', () => {
    const encoded = encodeKeysetCursor({
      view: 'tasks.completed',
      keys: ['2025-01-15T11:00:00.000Z', 'done-1'],
    });
    const decoded = decodeKeysetCursor(encoded, 'tasks.board');
    expect(decoded.isErr()).toBe(true);
  });
});
