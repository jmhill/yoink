import { err, ok, type Result } from 'neverthrow';
import type { CreateNamedListCommand } from './list-commands.js';
import type { NamedListCreated } from './events.js';
import {
  duplicateListNameError,
  invalidListNameError,
  type DuplicateListNameError,
  type InvalidListNameError,
} from './list-errors.js';
import { NAMED_LIST_NAME_MAX_LENGTH, normalizeListName } from './list-name.js';

export type DecideCreateNamedListInput = {
  command: CreateNamedListCommand;
  existingNames: readonly string[];
  id: string;
  now: string;
};

export type DecideCreateNamedListError = InvalidListNameError | DuplicateListNameError;

export const decideCreateNamedList = ({
  command,
  existingNames,
  id,
  now,
}: DecideCreateNamedListInput): Result<NamedListCreated, DecideCreateNamedListError> => {
  const name = command.name.trim();

  if (name.length < 1) {
    return err(invalidListNameError('Name is required'));
  }

  if (name.length > NAMED_LIST_NAME_MAX_LENGTH) {
    return err(invalidListNameError('Name must be 200 characters or fewer'));
  }

  const normalized = normalizeListName(name);
  const taken = existingNames.some(
    (existing) => normalizeListName(existing) === normalized
  );
  if (taken) {
    return err(duplicateListNameError(name));
  }

  return ok({
    type: 'NamedListCreated',
    id,
    organizationId: command.organizationId,
    createdById: command.createdById,
    name,
    createdAt: now,
  });
};
