import { errAsync, type ResultAsync } from 'neverthrow';
import type { DeleteNamedListCommand } from '../../domain/messages/list-commands.js';
import type { NamedListDeleted } from '../../domain/messages/list-events.js';
import { type DeleteNamedListError } from '../../domain/messages/list-errors.js';
import { decideDeleteNamedList } from '../../domain/decisions/decide-delete-list.js';
import { planListChange } from '../../domain/projections/plan-list-change.js';
import type {
  CountOpenTasksOnList,
  LoadNamedList,
  PersistNamedListChange,
} from '../ports.js';

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
        ids: { recordId: deps.nextId() },
      });

      return deps.persist(plan).map(() => ({ event }));
    };

    if (!current) {
      return persistDecision(0);
    }

    return deps.countOpenOnList(command.id).andThen(persistDecision);
  });
};
