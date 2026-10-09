import type { Capture, NamedList, Task } from '@yoink/api-contracts';
import type { KeysetCursor } from './keyset-cursor.js';
import type { KeysetDirection } from './keyset-window.js';

const UNPINNED_SENTINEL = '';
const MISSING_OPEN_ORDER = 2_147_483_647;

type CursorFor<View extends KeysetCursor['view']> = Extract<KeysetCursor, { view: View }>;

export const taskBoardCursor = (task: Task): CursorFor<'tasks.board'> => ({
  view: 'tasks.board',
  keys: [task.pinnedAt ?? UNPINNED_SENTINEL, task.createdAt, task.id],
});

export const completedTaskCursor = (task: Task): CursorFor<'tasks.completed'> => ({
  view: 'tasks.completed',
  keys: [task.completedAt ?? '', task.id],
});

export const openPileTaskCursor = (task: Task): CursorFor<'tasks.pile'> => ({
  view: 'tasks.pile',
  keys: [task.openOrder ?? MISSING_OPEN_ORDER, task.createdAt, task.id],
});

export const namedListCursor = (list: NamedList): CursorFor<'lists'> => ({
  view: 'lists',
  keys: [list.name, list.createdAt, list.id],
});

export const captureFeedCursor = (capture: Capture): CursorFor<'captures.feed'> => ({
  view: 'captures.feed',
  keys: [capture.capturedAt, capture.id],
});

export const snoozedCaptureCursor = (capture: Capture): CursorFor<'captures.snoozed'> => ({
  view: 'captures.snoozed',
  keys: [capture.snoozedUntil ?? '', capture.id],
});

export const taskBoardKeys = (task: Task) => taskBoardCursor(task).keys;
export const completedTaskKeys = (task: Task) => completedTaskCursor(task).keys;
export const openPileTaskKeys = (task: Task) => openPileTaskCursor(task).keys;
export const namedListKeys = (list: NamedList) => namedListCursor(list).keys;
export const captureFeedKeys = (capture: Capture) => captureFeedCursor(capture).keys;
export const snoozedCaptureKeys = (capture: Capture) => snoozedCaptureCursor(capture).keys;

export const taskBoardDirection: KeysetDirection = 'desc';
export const completedTaskDirection: KeysetDirection = 'desc';
export const openPileTaskDirection: KeysetDirection = 'asc';
export const namedListDirection: KeysetDirection = 'asc';
export const captureFeedDirection: KeysetDirection = 'desc';
export const snoozedCaptureDirection: KeysetDirection = 'asc';
