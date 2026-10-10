import { err, ok, type Result } from 'neverthrow';
import {
  ENTITY_NAME_MAX_LENGTH,
  entityNameIsTaken,
  normalizeEntityName,
  parseEntityName,
} from '../../shared/name.js';
import { invalidListNameError, type InvalidListNameError } from './list-errors.js';

export const NAMED_LIST_NAME_MAX_LENGTH = ENTITY_NAME_MAX_LENGTH;

export const normalizeListName = normalizeEntityName;

export const parseListName = (raw: string): Result<string, InvalidListNameError> => {
  const parsed = parseEntityName(raw);
  if (parsed.isErr()) {
    return err(
      invalidListNameError(
        parsed.error === 'empty' ? 'Name is required' : 'Name must be 200 characters or fewer'
      )
    );
  }

  return ok(parsed.value);
};

export const listNameIsTaken = entityNameIsTaken;
