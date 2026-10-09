import type { Capture, NamedList, Task } from '@yoink/api-contracts';
import type { InvalidCursorError } from '../domain/invalid-cursor.js';
import type { ListedPage } from '../domain/listed-page.js';

export const toTaskListBody = (page: ListedPage<Task>) => ({
  tasks: page.items,
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});

export const toCaptureListBody = (page: ListedPage<Capture>) => ({
  captures: page.items,
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});

export const toNamedListListBody = (page: ListedPage<NamedList>) => ({
  lists: page.items,
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});

export const invalidCursorHttp = (error: InvalidCursorError) => ({
  status: 400 as const,
  body: { message: error.message, code: 'invalid_cursor' },
});
