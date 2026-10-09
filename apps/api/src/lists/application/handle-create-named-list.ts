import { errAsync, type ResultAsync } from 'neverthrow';
import type { NamedList } from '@yoink/api-contracts';
import type { CreateNamedListCommand } from '../domain/list-commands.js';
import type { NamedListCreated } from '../domain/events.js';
import { storageError, type CreateNamedListError } from '../domain/list-errors.js';
import { decideCreateNamedList } from '../domain/decide-create.js';
import { planListChange } from '../domain/plan-list-change.js';
import type { ListNamedLists, PersistNamedListChange } from './ports.js';

export type HandleCreateNamedListDeps = {
  list: ListNamedLists;
  persist: PersistNamedListChange;
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
    const now = deps.now();
    const decision = decideCreateNamedList({
      command,
      existingNames: existing.map((list) => list.name),
      id: deps.nextId(),
      now,
    });

    if (decision.isErr()) {
      return errAsync(decision.error);
    }

    const event = decision.value;
    const plan = planListChange({
      event,
      current: null,
      actor: command.actor,
      ids: [deps.nextId()],
    });
    if (!plan || plan.action !== 'insert') {
      return errAsync(storageError('Create did not project a list'));
    }

    return deps.persist(plan).map(() => ({
      event,
      view: plan.view,
    }));
  });
};
