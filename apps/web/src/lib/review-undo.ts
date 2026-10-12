import type {
  AssignableProjectStatus,
  SetProjectNextAction,
  SetProjectNextActionResponse,
} from '@yoink/api-contracts';

export type NextActionUndoRestore = {
  readonly body: { taskId: string } | { taskId: null };
  readonly createdTaskId: string | null;
};

export type SettledResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

export type NextActionUndoOutcome =
  | { readonly kind: 'restored' }
  | { readonly kind: 'restore-failed'; readonly error: unknown }
  | { readonly kind: 'delete-failed'; readonly error: unknown };

export type NextActionUndoToast =
  | { readonly type: 'success'; readonly message: 'Next action restored' }
  | { readonly type: 'error'; readonly message: string };

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

export const settledResult = <T>(promise: Promise<T>): Promise<SettledResult<T>> =>
  promise.then(
    (value): SettledResult<T> => ({ ok: true, value }),
    (error: unknown): SettledResult<T> => ({ ok: false, error })
  );

/**
 * Restore the SET-time pointer, then delete a SET-created task.
 * Callers must not run this through the normal set-success path.
 */
export const runNextActionUndo = async (input: {
  restore: NextActionUndoRestore;
  restoreNextAction: () => Promise<unknown>;
  deleteCreatedTask: (taskId: string) => Promise<unknown>;
}): Promise<NextActionUndoOutcome> => {
  const restored = await settledResult(input.restoreNextAction());
  if (restored.ok === false) {
    return { kind: 'restore-failed', error: restored.error };
  }
  if (input.restore.createdTaskId === null) {
    return { kind: 'restored' };
  }
  const deleted = await settledResult(input.deleteCreatedTask(input.restore.createdTaskId));
  if (deleted.ok === false) {
    return { kind: 'delete-failed', error: deleted.error };
  }
  return { kind: 'restored' };
};

export const nextActionUndoToast = (input: {
  outcome: NextActionUndoOutcome;
  networkError: boolean;
}): NextActionUndoToast => {
  if (input.outcome.kind === 'restored') {
    return { type: 'success', message: 'Next action restored' };
  }
  if (input.networkError) {
    return { type: 'error', message: 'Network error. Please check your connection.' };
  }
  if (input.outcome.kind === 'delete-failed') {
    return { type: 'error', message: 'Failed to remove the created task' };
  }
  return { type: 'error', message: 'Failed to restore next action' };
};

export const reviewStatusUndoEnabled = (status: AssignableProjectStatus): boolean =>
  status !== 'done';
