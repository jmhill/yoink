import { describe, it, expect } from 'vitest';
import {
  LOAD_MORE_TEST_ID,
  emptyHistoryPages,
  mapHistoryPageItems,
  prependHistoryPageItem,
} from './use-history-pages';

describe('history paging', () => {
  it('exposes a stable load-more test id for E2E', () => {
    expect(LOAD_MORE_TEST_ID).toBe('load-more');
  });

  it('drops an item and lowers total on the first page', () => {
    const start = {
      pages: [
        {
          status: 200,
          body: {
            tasks: [{ id: 'a' }, { id: 'b' }],
            hasMore: false,
            nextCursor: null,
            total: 2,
          },
        },
      ],
      pageParams: [undefined],
    };

    const next = mapHistoryPageItems<'tasks', { id: string }>(
      start,
      'tasks',
      (items) => items.filter((item) => item.id !== 'a')
    ) as typeof start;

    expect(next.pages[0]?.body.tasks).toEqual([{ id: 'b' }]);
    expect(next.pages[0]?.body.total).toBe(1);
  });

  it('prepends onto the first history page', () => {
    const start = emptyHistoryPages('captures');
    const next = prependHistoryPageItem(start, 'captures', { id: 'new' }) as typeof start;
    expect(next.pages[0]?.body.captures).toEqual([{ id: 'new' }]);
    expect(next.pages[0]?.body.total).toBe(1);
  });
});
