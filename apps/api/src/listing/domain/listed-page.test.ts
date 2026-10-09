import { describe, it, expect } from 'vitest';
import { assembleListedPage } from './listed-page.js';

const rows = [
  { id: 'a', sort: '3' },
  { id: 'b', sort: '2' },
  { id: 'c', sort: '1' },
];

describe('listed page assembly', () => {
  it('sets hasMore and next from n+1 rows', () => {
    const page = assembleListedPage({
      rows: rows.slice(0, 3),
      total: 3,
      limit: 2,
      cursorOf: (item) => ({ view: 'captures.feed', keys: [item.sort, item.id] }),
    });
    expect(page.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(page.hasMore).toBe(true);
    expect(page.next).toEqual({ view: 'captures.feed', keys: ['2', 'b'] });
    expect(page.total).toBe(3);
  });

  it('clears next when the page is complete', () => {
    const page = assembleListedPage({
      rows: rows.slice(0, 2),
      total: 2,
      limit: 2,
      cursorOf: (item) => ({ view: 'captures.feed', keys: [item.sort, item.id] }),
    });
    expect(page.hasMore).toBe(false);
    expect(page.next).toBeNull();
  });
});
