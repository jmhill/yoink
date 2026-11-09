import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { CompleteTaskCommand } from '../../domain/messages/task-commands.js';
import type { CompleteTaskError } from '../../domain/messages/task-errors.js';
import type { TaskCompleted } from '../../domain/messages/task-events.js';
import { decideCompleteTask } from '../../domain/decisions/decide-complete.js';
import { planTaskChange } from '../../domain/projections/plan-task-change.js';
import { loadOwnedTask } from '../support/load-owned-task.js';
import type { LoadProject, LoadTask, PersistTaskChange } from '../ports.js';
import { kindsFromRecords, type WriteResult } from '../support/write-result.js';
import { planNextActionClear } from '../../domain/projections/plan-next-action-clear.js';

export type HandleCompleteTaskDeps = {
  load: LoadTask;
  loadProject: LoadProject;
  persist: PersistTaskChange;
  nextId: () => string;
  now: () => string;
};

export const handleCompleteTask = (
  command: CompleteTaskCommand,
  deps: HandleCompleteTaskDeps
): ResultAsync<WriteResult<TaskCompleted>, CompleteTaskError> => {
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
      const decision = decideCompleteTask({
        current,
        command,
        now,
      });

      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      if (decision.value.type === 'Noop') {
        return okAsync({ event: null, view: current, eventKinds: [] });
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
              change: { type: 'completed', taskId: current.id },
              actor: command.actor,
              now,
              recordId: deps.nextId(),
            });
      return deps.persist(plan, projectPlan ? { project: projectPlan } : undefined).map(() => ({
        event,
        view: plan.view,
        eventKinds: kindsFromRecords([
          ...plan.records,
          ...(projectPlan?.records ?? []),
        ]),
      }));
    });
  });
};
