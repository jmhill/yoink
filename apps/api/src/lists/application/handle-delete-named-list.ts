import { errAsync, type ResultAsync } from 'neverthrow';
import type { DeleteNamedListCommand } from '../domain/list-commands.js';
import type { NamedListDeleted } from '../domain/events.js';
import type { DeleteNamedListError } from '../domain/list-errors.js';
import { decideDeleteNamedList } from '../domain/decide-delete.js';
import type {
  CountOpenTasksOnList,
  LoadNamedList,
  PersistNamedListEvent,
} from './ports.js';

export type HandleDeleteNamedListDeps = {
  load: LoadNamedList;
  countOpenOnList: CountOpenTasksOnList;
  persist: PersistNamedListEvent;
};

export type DeleteNamedListResult = {
  event: NamedListDeleted;
};

export const handleDeleteNamedList = (
  command: DeleteNamedListCommand,
  deps: HandleDeleteNamedListDeps
): ResultAsync<DeleteNamedListResult, DeleteNamedListError> => {
  return deps.load(command.id).andThen((loaded) => {
    const current =
      loaded && loaded.organizationId === command.organizationId ? loaded : null;

    const persistDecision = (openTaskCount: number) => {
      const decision = decideDeleteNamedList({
        command,
        current,
        openTaskCount,
      });

      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      const event = decision.value;
      return deps.persist({ event }).map(() => ({ event }));
    };

    if (!current) {
      return persistDecision(0);
    }

    return deps.countOpenOnList(command.id).andThen(persistDecision);
  });
};
