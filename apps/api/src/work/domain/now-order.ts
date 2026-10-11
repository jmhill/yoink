import type { NowNextActionItem, Task } from '@yoink/api-contracts';
import { compareKeyset } from '../../listing/domain/keyset-window.js';
import {
  workDueKeys,
  workListKeys,
  workNextActionKeys,
  type WorkListCursorRow,
} from '../../listing/domain/list-keys.js';

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
