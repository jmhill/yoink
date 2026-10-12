import type {
  AssignableProjectStatus,
  SetProjectNextAction,
  SetProjectNextActionResponse,
} from '@yoink/api-contracts';

export type NextActionUndoRestore = {
  readonly body: { taskId: string } | { taskId: null };
  readonly createdTaskId: string | null;
};

export const createdTaskIdFromNextAction = (input: {
  body: SetProjectNextAction;
  result: SetProjectNextActionResponse;
}): string | null => {
  if (!('newTask' in input.body)) {
    return null;
  }
  if (input.result.task !== undefined) {
    return input.result.task.id;
  }
  return input.result.project.nextActionTaskId;
};

/**
 * Undo payload captured at SET time. Call this before mutate, optimistic
 * cache write, or invalidate — never from the toast click after refresh
 * has already seen the new pointer. `body` is the PUT; `createdTaskId`
 * is deleted after that restore when SET created the task.
 */
export const nextActionUndoRestore = (input: {
  previousTaskId: string | null;
  createdTaskId: string | null;
}): NextActionUndoRestore => ({
  body: input.previousTaskId === null ? { taskId: null } : { taskId: input.previousTaskId },
  createdTaskId: input.createdTaskId,
});

export type PendingNextActionUndo = {
  readonly projectId: string;
  readonly restore: NextActionUndoRestore;
};

let pendingNextActionUndo: PendingNextActionUndo | null = null;

export const queueNextActionUndo = (input: PendingNextActionUndo): void => {
  pendingNextActionUndo = input;
};

export const takeNextActionUndo = (
  projectId: string,
  body: SetProjectNextAction
): PendingNextActionUndo | null => {
  if (pendingNextActionUndo === null || pendingNextActionUndo.projectId !== projectId) {
    return null;
  }
  if ('newTask' in body || body.taskId !== pendingNextActionUndo.restore.body.taskId) {
    return null;
  }
  const pending = pendingNextActionUndo;
  pendingNextActionUndo = null;
  return pending;
};

export const clearNextActionUndo = (): void => {
  pendingNextActionUndo = null;
};

export const reviewStatusUndoEnabled = (status: AssignableProjectStatus): boolean =>
  status !== 'done';
