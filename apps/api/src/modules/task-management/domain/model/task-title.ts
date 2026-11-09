import { err, ok, type Result } from 'neverthrow';

export const TASK_TITLE_MAX_LENGTH = 500;

export type ParseTaskTitleError = {
  readonly type: 'TASK_TITLE_BLANK' | 'TASK_TITLE_TOO_LONG';
  readonly message: string;
};

export const parseTaskTitle = (raw: string): Result<string, ParseTaskTitleError> => {
  const title = raw.trim();
  if (title.length === 0) {
    return err({ type: 'TASK_TITLE_BLANK', message: "Title can't be blank" });
  }
  if (title.length > TASK_TITLE_MAX_LENGTH) {
    return err({
      type: 'TASK_TITLE_TOO_LONG',
      message: 'Title must be 500 characters or fewer',
    });
  }
  return ok(title);
};
