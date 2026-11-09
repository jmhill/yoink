import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { DeleteTaskCommand } from '../../domain/messages/task-commands.js';
import type { DeleteTaskError } from '../../domain/messages/task-errors.js';
import type { TaskDeleted } from '../../domain/messages/task-events.js';
import { decideDeleteTask } from '../../domain/decisions/decide-delete-task.js';
import { planTaskChange } from '../../domain/projections/plan-task-change.js';
import { loadOwnedTask } from '../support/load-owned-task.js';
import type { LoadProject, LoadTask, PersistTaskChange } from '../ports.js';
import { kindsFromRecords } from '../support/write-result.js';
import type { ChangeLogKind } from '../../../history/domain/kinds.js';
import { planNextActionClear } from '../../domain/projections/plan-next-action-clear.js';

export type HandleDeleteTaskDeps = {
  load: LoadTask;
  loadProject: LoadProject;
  persist: PersistTaskChange;
  nextId: () => string;
  now: () => string;
};

export type DeleteTaskResult = {
  event: TaskDeleted;
  eventKinds: ChangeLogKind[];
};

export const handleDeleteTask = (
  command: DeleteTaskCommand,
  deps: HandleDeleteTaskDeps
): ResultAsync<DeleteTaskResult, DeleteTaskError> => {
  return loadOwnedTask({
    id: command.id,
    organizationId: command.organizationId,
    load: deps.load,
  }).andThen((current) => {
    const loadedProject = current.projectId
      ? deps.loadProject(current.projectId)
      : okAsync(null);

    return loadedProject.andThen((project) => {
      const now = deps.now();
      const decision = decideDeleteTask({ current, command, now });

      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      const event = decision.value;
      const plan = planTaskChange({
        event,
        current,
        actor: command.actor,
        ids: { recordId: deps.nextId() },
      });
      const projectPlan =
        project === null
          ? null
          : planNextActionClear({
              project,
              change: { type: 'deleted', taskId: current.id },
              actor: command.actor,
              now,
              recordId: deps.nextId(),
            });
      return deps.persist(plan, projectPlan ? { project: projectPlan } : undefined).map(() => ({
        event,
        eventKinds: kindsFromRecords([
          ...plan.records,
          ...(projectPlan?.records ?? []),
        ]),
      }));
    });
  });
};
