import type { Capture, NamedList, Project, Task } from '@yoink/api-contracts';
import type { ListedCursor } from './keyset-cursor.js';
import type { KeysetDirection } from './keyset-window.js';

const UNPINNED_SENTINEL = '';
const MISSING_OPEN_ORDER = 2_147_483_647;

export const taskBoardCursor: ListedCursor<Task, 'tasks.board'> = {
  view: 'tasks.board',
  of: (task) => ({
    view: 'tasks.board',
    keys: [task.pinnedAt ?? UNPINNED_SENTINEL, task.createdAt, task.id],
  }),
};

export const completedTaskCursor: ListedCursor<Task, 'tasks.completed'> = {
  view: 'tasks.completed',
  of: (task) => ({
    view: 'tasks.completed',
    keys: [task.completedAt ?? '', task.id],
  }),
};

export const openPileTaskCursor: ListedCursor<Task, 'tasks.pile'> = {
  view: 'tasks.pile',
  of: (task) => ({
    view: 'tasks.pile',
    keys: [task.openOrder ?? MISSING_OPEN_ORDER, task.createdAt, task.id],
  }),
};

export const projectTaskCursor: ListedCursor<Task, 'tasks.project'> = {
  view: 'tasks.project',
  of: (task) => ({
    view: 'tasks.project',
    keys: [task.createdAt, task.id],
  }),
};

export const namedListCursor: ListedCursor<NamedList, 'lists'> = {
  view: 'lists',
  of: (list) => ({
    view: 'lists',
    keys: [list.name, list.createdAt, list.id],
  }),
};

export const projectCursor: ListedCursor<Project, 'projects'> = {
  view: 'projects',
  of: (project) => ({
    view: 'projects',
    keys: [project.name, project.createdAt, project.id],
  }),
};

export const captureFeedCursor: ListedCursor<Capture, 'captures.feed'> = {
  view: 'captures.feed',
  of: (capture) => ({
    view: 'captures.feed',
    keys: [capture.capturedAt, capture.id],
  }),
};

export const snoozedCaptureCursor: ListedCursor<Capture, 'captures.snoozed'> = {
  view: 'captures.snoozed',
  of: (capture) => ({
    view: 'captures.snoozed',
    keys: [capture.snoozedUntil ?? '', capture.id],
  }),
};

export const taskBoardKeys = (task: Task) => taskBoardCursor.of(task).keys;
export const completedTaskKeys = (task: Task) => completedTaskCursor.of(task).keys;
export const openPileTaskKeys = (task: Task) => openPileTaskCursor.of(task).keys;
export const projectTaskKeys = (task: Task) => projectTaskCursor.of(task).keys;
export const namedListKeys = (list: NamedList) => namedListCursor.of(list).keys;
export const projectKeys = (project: Project) => projectCursor.of(project).keys;
export const captureFeedKeys = (capture: Capture) => captureFeedCursor.of(capture).keys;
export const snoozedCaptureKeys = (capture: Capture) => snoozedCaptureCursor.of(capture).keys;

export const taskBoardDirection: KeysetDirection = 'desc';
export const completedTaskDirection: KeysetDirection = 'desc';
export const openPileTaskDirection: KeysetDirection = 'asc';
export const projectTaskDirection: KeysetDirection = 'desc';
export const namedListDirection: KeysetDirection = 'asc';
export const projectDirection: KeysetDirection = 'asc';
export const captureFeedDirection: KeysetDirection = 'desc';
export const snoozedCaptureDirection: KeysetDirection = 'asc';
