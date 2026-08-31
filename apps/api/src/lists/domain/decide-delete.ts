import { err, ok, type Result } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { DeleteNamedListCommand } from './list-commands.js';
import type { NamedListDeleted } from './events.js';
import {
  listHasOpenTasksError,
  listNotFoundError,
  type ListHasOpenTasksError,
  type ListNotFoundError,
} from './list-errors.js';

export type DecideDeleteNamedListInput = {
  command: DeleteNamedListCommand;
  current: NamedList | null;
  openTaskCount: number;
};

export type DecideDeleteNamedListError = ListNotFoundError | ListHasOpenTasksError;

export const decideDeleteNamedList = ({
  command,
  current,
  openTaskCount,
}: DecideDeleteNamedListInput): Result<NamedListDeleted, DecideDeleteNamedListError> => {
  if (!current || current.organizationId !== command.organizationId) {
    return err(listNotFoundError(command.id));
  }

  if (openTaskCount > 0) {
    return err(listHasOpenTasksError(command.id, openTaskCount));
  }

  return ok({
    type: 'NamedListDeleted',
    id: current.id,
    organizationId: current.organizationId,
  });
};
