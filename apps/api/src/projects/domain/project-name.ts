import { err, ok, type Result } from 'neverthrow';
import {
  ENTITY_NAME_MAX_LENGTH,
  entityNameIsTaken,
  normalizeEntityName,
  parseEntityName,
} from '../../shared/name.js';
import { invalidProjectNameError, type InvalidProjectNameError } from './project-errors.js';

export const PROJECT_NAME_MAX_LENGTH = ENTITY_NAME_MAX_LENGTH;

export const normalizeProjectName = normalizeEntityName;

export const parseProjectName = (raw: string): Result<string, InvalidProjectNameError> => {
  const parsed = parseEntityName(raw);
  if (parsed.isErr()) {
    return err(
      invalidProjectNameError(
        parsed.error === 'empty' ? 'Name is required' : 'Name must be 200 characters or fewer'
      )
    );
  }

  return ok(parsed.value);
};

export const projectNameIsTaken = entityNameIsTaken;
