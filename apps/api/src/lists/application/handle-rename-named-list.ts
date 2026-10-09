import { errAsync, type ResultAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { RenameNamedListCommand } from '../domain/list-commands.js';
import type { NamedListRenamed } from '../domain/events.js';
import { storageError, type RenameNamedListError } from '../domain/list-errors.js';
import { decideRenameNamedList } from '../domain/decide-rename.js';
import { applyNamedListEvent } from '../domain/apply-named-list-event.js';
import type { ListNamedLists, LoadNamedList, PersistNamedListEvent } from './ports.js';

export type HandleRenameNamedListDeps = {
  load: LoadNamedList;
  list: ListNamedLists;
  persist: PersistNamedListEvent;
  now: () => string;
};

export type RenameNamedListResult = {
  event: NamedListRenamed;
  view: NamedList;
};

export const handleRenameNamedList = (
  command: RenameNamedListCommand,
  deps: HandleRenameNamedListDeps
): ResultAsync<RenameNamedListResult, RenameNamedListError> => {
  return deps.load(command.id).andThen((loaded) => {
    const current =
      loaded && loaded.organizationId === command.organizationId ? loaded : null;

    const persistDecision = (existingNames: readonly string[]) => {
      const decision = decideRenameNamedList({
        command,
        current,
        existingNames,
      });

      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      const event = decision.value;
      const view = applyNamedListEvent(current, event);
      if (!view) {
        return errAsync(storageError('Rename did not project a list'));
      }

      return deps.persist({ event, actor: command.actor ?? null, now: deps.now() }).map(() => ({ event, view }));
    };

    if (!current) {
      return persistDecision([]);
    }

    return deps.list(command.organizationId).andThen((existing) =>
      persistDecision(existing.map((list) => list.name))
    );
  });
};
