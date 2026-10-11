import { err, ok, type Result } from 'neverthrow';
import { PROJECT_WAITING_ON_MAX_LENGTH } from '@yoink/api-contracts';
import { parseIsoDate } from '../../shared/domain/iso-date.js';
import {
  invalidWaitingSinceError,
  projectWaitingOnBlankError,
  projectWaitingOnTooLongError,
  type InvalidWaitingSinceError,
  type ProjectWaitingOnBlankError,
  type ProjectWaitingOnTooLongError,
} from './project-errors.js';

export { PROJECT_WAITING_ON_MAX_LENGTH };

export type ParseWaitingOnError = ProjectWaitingOnBlankError | ProjectWaitingOnTooLongError;

export const parseWaitingOn = (raw: string): Result<string, ParseWaitingOnError> => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return err(projectWaitingOnBlankError());
  }
  if (trimmed.length > PROJECT_WAITING_ON_MAX_LENGTH) {
    return err(projectWaitingOnTooLongError());
  }
  return ok(trimmed);
};

export const parseWaitingSince = (raw: string): Result<string, InvalidWaitingSinceError> => {
  const parsed = parseIsoDate(raw);
  return parsed.isOk() ? ok(parsed.value) : err(invalidWaitingSinceError());
};
