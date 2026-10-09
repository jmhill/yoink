import { errAsync, type ResultAsync } from 'neverthrow';
import type { DeleteNamedListCommand } from '../domain/list-commands.js';
import type { NamedListDeleted } from '../domain/events.js';
import { storageError, type DeleteNamedListError } from '../domain/list-errors.js';
import { decideDeleteNamedList } from '../domain/decide-delete.js';
import { planListChange } from '../domain/plan-list-change.js';
import type {
  CountOpenTasksOnList,
  LoadNamedList,
  PersistNamedListChange,
} from './ports.js';

export type HandleDeleteNamedListDeps = {
  load: LoadNamedList;
  countOpenOnList: CountOpenTasksOnList;
  persist: PersistNamedListChange;
  nextId: () => string;
  now: () => string;
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
      const now = deps.now();
      const decision = decideDeleteNamedList({
        command,
        current,
        openTaskCount,
        now,
      });

      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      const event = decision.value;
      const plan = planListChange({
        event,
        current,
        actor: command.actor,
        ids: [deps.nextId()],
      });
      if (!plan || plan.action !== 'delete') {
        return errAsync(storageError('Delete did not project a list'));
      }

      return deps.persist(plan).map(() => ({ event }));
    };

    if (!current) {
      return persistDecision(0);
    }

    return deps.countOpenOnList(command.id).andThen(persistDecision);
  });
};
