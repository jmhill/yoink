import { describe, it, expect } from 'vitest';
import {
  LOAD_MORE_TEST_ID,
  emptyCaptureHistoryPages,
  isCaptureHistoryData,
  isTaskHistoryData,
  mapCaptureHistoryPageItems,
  mapTaskHistoryPageItems,
  prependCaptureHistoryPageItem,
  type TaskHistoryData,
} from './use-history-pages';

describe('history paging', () => {
  it('exposes a stable load-more test id for E2E', () => {
    expect(LOAD_MORE_TEST_ID).toBe('load-more');
  });

  it('drops an item and lowers total on the first page', () => {
    const start: TaskHistoryData = {
      pages: [
        {
          status: 200,
          body: {
            tasks: [
              {
                id: 'a',
                organizationId: 'org',
                createdById: 'user',
                title: 'A',
                createdAt: '2025-01-15T10:00:00.000Z',
              },
              {
                id: 'b',
                organizationId: 'org',
                createdById: 'user',
                title: 'B',
                createdAt: '2025-01-15T10:00:00.000Z',
              },
            ],
            hasMore: false,
            nextCursor: null,
            total: 2,
          },
        },
      ],
      pageParams: [undefined],
    };

    expect(isTaskHistoryData(start)).toBe(true);
    const next = mapTaskHistoryPageItems(start, (items) =>
      items.filter((item) => item.id !== 'a')
    );

    expect(next.pages[0]?.body.tasks.map((task) => task.id)).toEqual(['b']);
    expect(next.pages[0]?.body.total).toBe(1);
  });

  it('prepends onto the first history page', () => {
    const start = emptyCaptureHistoryPages();
    expect(isCaptureHistoryData(start)).toBe(true);
    const next = prependCaptureHistoryPageItem(start, {
      id: 'new',
      organizationId: 'org',
      createdById: 'user',
      content: 'New',
      status: 'trashed',
      capturedAt: '2025-01-15T10:00:00.000Z',
    });
    expect(next.pages[0]?.body.captures.map((capture) => capture.id)).toEqual(['new']);
    expect(next.pages[0]?.body.total).toBe(1);
  });

  it('maps capture page items without casts', () => {
    const start = emptyCaptureHistoryPages();
    const withItem = prependCaptureHistoryPageItem(start, {
      id: 'keep',
      organizationId: 'org',
      createdById: 'user',
      content: 'Keep',
      status: 'trashed',
      capturedAt: '2025-01-15T10:00:00.000Z',
    });
    const next = mapCaptureHistoryPageItems(withItem, (items) =>
      items.filter((item) => item.id !== 'keep')
    );
    expect(next.pages[0]?.body.captures).toEqual([]);
    expect(next.pages[0]?.body.total).toBe(0);
  });
});
