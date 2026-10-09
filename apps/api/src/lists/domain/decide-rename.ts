import { err, ok, type Result } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { RenameNamedListCommand } from './list-commands.js';
import type { NamedListRenamed } from './events.js';
import {
  duplicateListNameError,
  listNotFoundError,
  type DuplicateListNameError,
  type InvalidListNameError,
  type ListNotFoundError,
} from './list-errors.js';
import { listNameIsTaken, normalizeListName, parseListName } from './list-name.js';

export type DecideRenameNamedListInput = {
  command: RenameNamedListCommand;
  current: NamedList | null;
  existingNames: readonly string[];
  now: string;
};

export type DecideRenameNamedListError =
  | InvalidListNameError
  | DuplicateListNameError
  | ListNotFoundError;

export const decideRenameNamedList = ({
  command,
  current,
  existingNames,
  now,
}: DecideRenameNamedListInput): Result<NamedListRenamed, DecideRenameNamedListError> => {
  if (!current || current.organizationId !== command.organizationId) {
    return err(listNotFoundError(command.id));
  }

  const parsed = parseListName(command.name);
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  const name = parsed.value;
  const others = existingNames.filter(
    (existing) => normalizeListName(existing) !== normalizeListName(current.name)
  );
  if (listNameIsTaken(name, others)) {
    return err(duplicateListNameError(name));
  }

  return ok({
    type: 'NamedListRenamed',
    id: current.id,
    organizationId: current.organizationId,
    name,
    occurredAt: now,
  });
};
