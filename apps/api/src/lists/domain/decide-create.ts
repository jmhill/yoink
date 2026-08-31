import { err, ok, type Result } from 'neverthrow';
import type { CreateNamedListCommand } from './list-commands.js';
import type { NamedListCreated } from './events.js';
import {
  invalidListNameError,
  type InvalidListNameError,
} from './list-errors.js';

export const NAMED_LIST_NAME_MAX_LENGTH = 200;

export type DecideCreateNamedListInput = {
  command: CreateNamedListCommand;
  id: string;
  now: string;
};

export const decideCreateNamedList = ({
  command,
  id,
  now,
}: DecideCreateNamedListInput): Result<NamedListCreated, InvalidListNameError> => {
  const name = command.name.trim();

  if (name.length < 1) {
    return err(invalidListNameError('Name is required'));
  }

  if (name.length > NAMED_LIST_NAME_MAX_LENGTH) {
    return err(invalidListNameError('Name must be 200 characters or fewer'));
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
