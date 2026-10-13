import { err, ok, type Result } from 'neverthrow';
import {
  PROJECT_REASON_MAX_LENGTH,
  PROJECT_SUGGESTED_NEXT_ACTION_MAX_LENGTH,
} from '@yoink/api-contracts';
import {
  invalidProjectReasonError,
  invalidSuggestedNextActionError,
  type InvalidProjectReasonError,
  type InvalidSuggestedNextActionError,
} from './project-errors.js';

export const parseProjectReason = (
  raw: string | undefined | null
): Result<string | undefined, InvalidProjectReasonError> => {
  if (raw === undefined || raw === null) {
    return ok(undefined);
  }

  const reason = raw.trim();
  if (reason.length < 1) {
    return ok(undefined);
  }
  if (reason.length > PROJECT_REASON_MAX_LENGTH) {
    return err(invalidProjectReasonError());
  }
  return ok(reason);
};

export const parseSuggestedNextAction = (
  raw: string | undefined | null
): Result<string | undefined, InvalidSuggestedNextActionError> => {
  if (raw === undefined || raw === null) {
    return ok(undefined);
  }

  const title = raw.trim();
  if (title.length < 1) {
    return ok(undefined);
  }
  if (title.length > PROJECT_SUGGESTED_NEXT_ACTION_MAX_LENGTH) {
    return err(invalidSuggestedNextActionError());
  }
  return ok(title);
};
