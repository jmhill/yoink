import { errAsync, type ResultAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { CreateNamedListCommand } from '../domain/list-commands.js';
import type { NamedListCreated } from '../domain/events.js';
import type { CreateNamedListError } from '../domain/list-errors.js';
import { decideCreateNamedList } from '../domain/decide-create.js';
import { applyNamedListEvent } from '../domain/apply-named-list-event.js';
import type { ListNamedLists, PersistNamedListEvent } from './ports.js';

export type HandleCreateNamedListDeps = {
  list: ListNamedLists;
  persist: PersistNamedListEvent;
  nextId: () => string;
  now: () => string;
};

export type CreateNamedListResult = {
  event: NamedListCreated;
  view: NamedList;
};

export const handleCreateNamedList = (
  command: CreateNamedListCommand,
  deps: HandleCreateNamedListDeps
): ResultAsync<CreateNamedListResult, CreateNamedListError> => {
  return deps.list(command.organizationId).andThen((existing) => {
    const decision = decideCreateNamedList({
      command,
      existingNames: existing.map((list) => list.name),
      id: deps.nextId(),
      now: deps.now(),
    });

    if (decision.isErr()) {
      return errAsync(decision.error);
    }

    const event = decision.value;

    return deps.persist({ event }).map(() => ({
      event,
      view: applyNamedListEvent(null, event),
    }));
  });
};
