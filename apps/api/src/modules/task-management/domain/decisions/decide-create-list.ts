import { err, ok, type Result } from 'neverthrow';
import type { CreateNamedListCommand } from '../messages/list-commands.js';
import type { NamedListCreated } from '../messages/list-events.js';
import {
  duplicateListNameError,
  type DuplicateListNameError,
  type InvalidListNameError,
} from '../messages/list-errors.js';
import { listNameIsTaken, parseListName } from '../model/list-name.js';

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
  const parsed = parseListName(command.name);
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  const name = parsed.value;
  if (listNameIsTaken(name, existingNames)) {
    return err(duplicateListNameError(name));
  }

  return ok({
    type: 'NamedListCreated',
    id,
    organizationId: command.organizationId,
    createdById: command.createdById,
    name,
    createdAt: now,
    occurredAt: now,
  });
};
