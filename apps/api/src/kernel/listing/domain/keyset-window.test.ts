import { describe, it, expect } from 'vitest';
import { applyKeysetWindow, compareBinary } from './keyset-window.js';

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
    const remaining = applyKeysetWindow({
      ordered: [items[0]!, items[2]!],
      keysOf: (item) => [item.sort, item.id],
      direction: 'desc',
      fetchLimit: 10,
      seek: { view: 'captures.feed', keys: ['2', 'b'] },
    });

    expect(remaining.map((item) => item.id)).toEqual(['c']);
  });
});
