import type { Capture, NamedList, NowNextActionItem, Project, Task } from '@yoink/api-contracts';
import type { InvalidCursorError } from '../domain/invalid-cursor.js';
import type { ListedPage } from '../domain/listed-page.js';
import type { WorkListCursorRow } from '../domain/list-keys.js';

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

export const toProjectListBody = (page: ListedPage<Project>) => ({
  projects: page.items,
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});

export const toWorkNextActionsBody = (page: ListedPage<NowNextActionItem>) => ({
  items: page.items,
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});

export const toWorkListsBody = (
  page: ListedPage<WorkListCursorRow> & { unlisted: { openTaskCount: number } }
) => ({
  lists: page.items.map((list) => ({
    id: list.id,
    name: list.name,
    openTaskCount: list.openTaskCount,
  })),
  unlisted: page.unlisted,
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});

export const invalidCursorHttp = (error: InvalidCursorError) => ({
  status: 400 as const,
  body: { message: error.message, code: 'invalid_cursor' },
});
