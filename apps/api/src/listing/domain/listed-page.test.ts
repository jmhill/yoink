import { describe, it, expect } from 'vitest';
import { okAsync } from 'neverthrow';
import { assembleListedPage, runListedQuery } from './listed-page.js';
import { encodeKeysetCursor } from './keyset-cursor.js';

const rows = [
  { id: 'a', sort: '3' },
  { id: 'b', sort: '2' },
  { id: 'c', sort: '1' },
];

describe('listed page assembly', () => {
  it('sets hasMore and nextCursor from n+1 rows', () => {
    const page = assembleListedPage({
      rows: rows.slice(0, 3),
      total: 3,
      limit: 2,
      cursorOf: (item) => ({ keys: [item.sort, item.id] }),
    });
    expect(page.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe(encodeKeysetCursor({ keys: ['2', 'b'] }));
    expect(page.total).toBe(3);
  });

  it('returns InvalidCursor without loading when the cursor is malformed', async () => {
    const result = await runListedQuery({
      cursor: 'nope',
      limit: 2,
      cursorOf: (item: { id: string }) => ({ keys: [item.id] }),
      load: () => okAsync({ rows: [], total: 0 }),
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('INVALID_CURSOR');
    }
  });
});
