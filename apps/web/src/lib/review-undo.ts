import type {
  AssignableProjectStatus,
  SetProjectNextAction,
  SetProjectNextActionResponse,
} from '@yoink/api-contracts';

export type NextActionUndoRestore = { taskId: string } | { taskId: null };

export const createdTaskIdFromNextAction = (input: {
  body: SetProjectNextAction;
  result: SetProjectNextActionResponse;
}): string | null => {
  if (!('newTask' in input.body) || input.result.task === undefined) {
    return null;
  }
  return input.result.task.id;
};

/**
 * Body that Undo must PUT to restore the next action captured at SET time.
 * Call this before the SET mutate, optimistic cache write, or invalidate —
 * never from the toast click after refresh has already seen the new pointer.
 */
export const nextActionUndoRestore = (previousTaskId: string | null): NextActionUndoRestore =>
  previousTaskId === null ? { taskId: null } : { taskId: previousTaskId };

export const reviewStatusUndoEnabled = (status: AssignableProjectStatus): boolean =>
  status !== 'done';
