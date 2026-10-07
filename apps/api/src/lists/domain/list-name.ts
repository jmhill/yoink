import { err, ok, type Result } from 'neverthrow';
import { invalidListNameError, type InvalidListNameError } from './list-errors.js';

export const NAMED_LIST_NAME_MAX_LENGTH = 200;

export const normalizeListName = (name: string): string => name.trim().toLowerCase();

export const parseListName = (raw: string): Result<string, InvalidListNameError> => {
  const name = raw.trim();

  if (name.length < 1) {
    return err(invalidListNameError('Name is required'));
  }

  if (name.length > NAMED_LIST_NAME_MAX_LENGTH) {
    return err(invalidListNameError('Name must be 200 characters or fewer'));
  }

  return ok(name);
};

export const listNameIsTaken = (
  name: string,
  existingNames: readonly string[]
): boolean => {
  const normalized = normalizeListName(name);
  return existingNames.some((existing) => normalizeListName(existing) === normalized);
};
