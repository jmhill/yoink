import { describe, it, expect } from 'vitest';
import { decodeKeysetCursor, encodeKeysetCursor } from './keyset-cursor.js';

describe('keyset cursor', () => {
  it('round-trips sort keys including numbers and null', () => {
    const encoded = encodeKeysetCursor({ keys: ['2025-01-15T10:00:00.000Z', 3, null, 'id'] });
    const decoded = decodeKeysetCursor(encoded);
    expect(decoded.isOk()).toBe(true);
    if (decoded.isOk()) {
      expect(decoded.value.keys).toEqual(['2025-01-15T10:00:00.000Z', 3, null, 'id']);
    }
  });

  it('rejects a malformed cursor', () => {
    const decoded = decodeKeysetCursor('not-a-cursor');
    expect(decoded.isErr()).toBe(true);
    if (decoded.isErr()) {
      expect(decoded.error.type).toBe('INVALID_CURSOR');
    }
  });
});
