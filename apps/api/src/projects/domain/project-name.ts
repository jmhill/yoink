import { err, ok, type Result } from 'neverthrow';
import {
  ENTITY_NAME_MAX_LENGTH,
  entityNameIsTaken,
  normalizeEntityName,
  parseEntityName,
} from '../../shared/name.js';
import {
  invalidProjectNameError,
  projectNameBlankError,
  type InvalidProjectNameError,
  type ProjectNameBlankError,
} from './project-errors.js';

export const PROJECT_NAME_MAX_LENGTH = ENTITY_NAME_MAX_LENGTH;

export const normalizeProjectName = normalizeEntityName;

export type ParseProjectNameError = InvalidProjectNameError | ProjectNameBlankError;

export const parseProjectName = (raw: string): Result<string, ParseProjectNameError> => {
  const parsed = parseEntityName(raw);
  if (parsed.isErr()) {
    if (parsed.error === 'empty') {
      return err(projectNameBlankError());
    }
    return err(invalidProjectNameError('Name must be 200 characters or fewer'));
  }

  return ok(parsed.value);
};

export const projectNameIsTaken = entityNameIsTaken;
