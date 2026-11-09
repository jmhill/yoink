import type { NowNextActionItem, Task } from '@yoink/api-contracts';

// Task Management owns this order. SQL, the fake store, and cursors share these keys.
// A screen composes sections from the returned pages and does not sort them again.
import { compareKeyset } from '../../../../kernel/listing/domain/keyset-window.js';
import {
  workDueKeys,
  workListKeys,
  workNextActionKeys,
  type WorkListCursorRow,
} from '../../../../kernel/listing/domain/list-keys.js';

export const compareNowNextActions = (
  left: NowNextActionItem,
  right: NowNextActionItem
): number => compareKeyset(workNextActionKeys(left), workNextActionKeys(right));

export const compareNowDue = (left: Task, right: Task): number =>
  compareKeyset(workDueKeys(left), workDueKeys(right));

export const compareWorkLists = (
  left: WorkListCursorRow,
  right: WorkListCursorRow
): number => compareKeyset(workListKeys(left), workListKeys(right));
