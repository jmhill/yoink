import type { Capture, NamedList, Task } from '@yoink/api-contracts';
import type { KeysetCursor, KeysetValue } from './keyset-cursor.js';
import type { KeysetDirection } from './keyset-window.js';

const UNPINNED_SENTINEL = '';
const MISSING_OPEN_ORDER = 2_147_483_647;

export const taskBoardKeys = (task: Task): KeysetValue[] => [
  task.pinnedAt ?? UNPINNED_SENTINEL,
  task.createdAt,
  task.id,
];

export const completedTaskKeys = (task: Task): KeysetValue[] => [
  task.completedAt ?? '',
  task.id,
];

export const openPileTaskKeys = (task: Task): KeysetValue[] => [
  task.openOrder ?? MISSING_OPEN_ORDER,
  task.createdAt,
  task.id,
];

export const namedListKeys = (list: NamedList): KeysetValue[] => [
  list.name,
  list.createdAt,
  list.id,
];

export const captureFeedKeys = (capture: Capture): KeysetValue[] => [
  capture.capturedAt,
  capture.id,
];

export const snoozedCaptureKeys = (capture: Capture): KeysetValue[] => [
  capture.snoozedUntil ?? '',
  capture.id,
];

export const taskBoardCursor = (task: Task): KeysetCursor => ({ keys: taskBoardKeys(task) });
export const completedTaskCursor = (task: Task): KeysetCursor => ({
  keys: completedTaskKeys(task),
});
export const openPileTaskCursor = (task: Task): KeysetCursor => ({
  keys: openPileTaskKeys(task),
});
export const namedListCursor = (list: NamedList): KeysetCursor => ({
  keys: namedListKeys(list),
});
export const captureFeedCursor = (capture: Capture): KeysetCursor => ({
  keys: captureFeedKeys(capture),
});
export const snoozedCaptureCursor = (capture: Capture): KeysetCursor => ({
  keys: snoozedCaptureKeys(capture),
});

export const taskBoardDirection: KeysetDirection = 'desc';
export const completedTaskDirection: KeysetDirection = 'desc';
export const openPileTaskDirection: KeysetDirection = 'asc';
export const namedListDirection: KeysetDirection = 'asc';
export const captureFeedDirection: KeysetDirection = 'desc';
export const snoozedCaptureDirection: KeysetDirection = 'asc';
