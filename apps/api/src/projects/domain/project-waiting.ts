import { err, ok, type Result } from 'neverthrow';
import { PROJECT_WAITING_ON_MAX_LENGTH } from '@yoink/api-contracts';
import {
  invalidWaitingSinceError,
  projectWaitingOnBlankError,
  projectWaitingOnTooLongError,
  type InvalidWaitingSinceError,
  type ProjectWaitingOnBlankError,
  type ProjectWaitingOnTooLongError,
} from './project-errors.js';

export { PROJECT_WAITING_ON_MAX_LENGTH };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

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
  const match = ISO_DATE.exec(raw);
  if (!match) {
    return err(invalidWaitingSinceError());
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return err(invalidWaitingSinceError());
  }

  return ok(raw);
};
