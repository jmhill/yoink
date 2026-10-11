import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { DeleteTaskCommand } from '../domain/task-commands.js';
import type { DeleteTaskError } from '../domain/task-errors.js';
import type { TaskDeleted } from '../domain/events.js';
import { decideDeleteTask } from '../domain/decide-delete.js';
import { planTaskChange } from '../domain/plan-task-change.js';
import { loadOwnedTask } from './load-owned-task.js';
import type { LoadProject, LoadTask, PersistTaskChange } from './ports.js';
import { kindsFromRecords } from './write-result.js';
import type { ChangeLogKind } from '../../shared/change-log/domain/kinds.js';
import { planNextActionClear } from '../../projects/application/plan-next-action-clear.js';

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
