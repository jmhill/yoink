import type { Capture, NoteListItem } from '@yoink/api-contracts';
import type { InvalidCursorError } from '../../kernel/listing/domain/invalid-cursor.js';
import type { ListedPage } from '../../kernel/listing/domain/listed-page.js';
import type { WorkListCursorRow } from '../../kernel/listing/domain/list-keys.js';
import type {
  NamedList,
  NowNextActionItem,
  Project,
  Task,
} from '../../modules/task-management/index.js';
import {
  toContractNamedListPage,
  toContractNowNextActionPage,
  toContractProjectPage,
  toContractTaskPage,
} from './map-task-document.js';

export const toTaskListBody = (page: ListedPage<Task>) => {
  const mapped = toContractTaskPage(page);
  return {
    tasks: mapped.items,
    hasMore: mapped.hasMore,
    nextCursor: mapped.nextCursor,
    total: mapped.total,
  };
};

export const toCaptureListBody = (page: ListedPage<Capture>) => ({
  captures: page.items,
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});

export const toNamedListListBody = (page: ListedPage<NamedList>) => {
  const mapped = toContractNamedListPage(page);
  return {
    lists: mapped.items,
    hasMore: mapped.hasMore,
    nextCursor: mapped.nextCursor,
    total: mapped.total,
  };
};

export const toProjectListBody = (page: ListedPage<Project>) => {
  const mapped = toContractProjectPage(page);
  return {
    projects: mapped.items,
    hasMore: mapped.hasMore,
    nextCursor: mapped.nextCursor,
    total: mapped.total,
  };
};

export const toNoteListBody = (page: ListedPage<NoteListItem>) => ({
  notes: page.items,
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});

export const toWorkNextActionsBody = (page: ListedPage<NowNextActionItem>) => {
  const mapped = toContractNowNextActionPage(page);
  return {
    items: mapped.items,
    hasMore: mapped.hasMore,
    nextCursor: mapped.nextCursor,
    total: mapped.total,
  };
};

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
