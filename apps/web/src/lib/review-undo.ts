import type {
  AssignableProjectStatus,
  SetProjectNextAction,
  SetProjectNextActionResponse,
} from '@yoink/api-contracts';

export const createdTaskIdFromNextAction = (input: {
  body: SetProjectNextAction;
  result: SetProjectNextActionResponse;
}): string | null => {
  if (!('newTask' in input.body) || input.result.task === undefined) {
    return null;
  }
  return input.result.task.id;
};

export const reviewStatusUndoEnabled = (status: AssignableProjectStatus): boolean =>
  status !== 'done';
