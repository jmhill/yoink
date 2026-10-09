import { describe, it, expect } from 'vitest';
import { pageListedItems } from './page-listed-items.js';

const items = [
  { id: 'a', n: 1 },
  { id: 'b', n: 2 },
  { id: 'c', n: 3 },
  { id: 'd', n: 4 },
  { id: 'e', n: 5 },
];

describe('pageListedItems', () => {
  it('returns the whole list when no limit is set', () => {
    expect(pageListedItems(items)).toEqual({
      items,
      hasMore: false,
      nextCursor: null,
      total: 5,
    });
  });

  it('pages without gaps or duplicates', () => {
    const first = pageListedItems(items, { limit: 2 });
    expect(first).toEqual({
      items: [items[0], items[1]],
      hasMore: true,
      nextCursor: 'b',
      total: 5,
    });

    const second = pageListedItems(items, { limit: 2, cursor: first.nextCursor! });
    expect(second.items.map((item) => item.id)).toEqual(['c', 'd']);
    expect(second.hasMore).toBe(true);

    const third = pageListedItems(items, { limit: 2, cursor: second.nextCursor! });
    expect(third.items.map((item) => item.id)).toEqual(['e']);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();

    const ids = [...first.items, ...second.items, ...third.items].map((item) => item.id);
    expect(ids).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(new Set(ids).size).toBe(5);
  });

  it('does not rewind when the cursor is unknown', () => {
    const page = pageListedItems(items, { limit: 2, cursor: 'missing' });
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.total).toBe(5);
  });
});
