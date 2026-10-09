import { describe, it, expect } from 'vitest';
import { applyKeysetWindow, compareBinary } from './keyset-window.js';
import { encodeKeysetCursor } from './keyset-cursor.js';

const items = [
  { id: 'a', sort: '3' },
  { id: 'b', sort: '2' },
  { id: 'c', sort: '1' },
];

describe('keyset window', () => {
  it('tie-breaks with plain < and >', () => {
    expect(compareBinary('a', 'b')).toBeLessThan(0);
    expect(compareBinary('b', 'a')).toBeGreaterThan(0);
    expect(compareBinary('a', 'a')).toBe(0);
  });

  it('resumes after a missing cursor item', () => {
    const cursor = encodeKeysetCursor({ keys: ['2', 'b'] });
    const decoded = { keys: ['2', 'b'] as const };
    expect(cursor.length).toBeGreaterThan(0);

    const remaining = applyKeysetWindow({
      ordered: [items[0]!, items[2]!],
      keysOf: (item) => [item.sort, item.id],
      direction: 'desc',
      fetchLimit: 10,
      seek: decoded,
    });

    expect(remaining.map((item) => item.id)).toEqual(['c']);
  });
});
