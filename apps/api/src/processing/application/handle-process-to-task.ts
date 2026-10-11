import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { ProcessCaptureToTaskCommand } from '../../captures/domain/capture-commands.js';
import type {
  CaptureNotFoundError,
  CaptureNotInInboxError,
  StorageError as CaptureStorageError,
} from '../../captures/domain/capture-errors.js';
import type { CreateTaskError } from '../../tasks/domain/task-errors.js';
import { decideProcessCaptureToTask } from '../domain/decide-process-to-task.js';
import { planTaskChange } from '../../tasks/domain/plan-task-change.js';
import type {
  LoadCapture,
  LoadNamedList,
  LoadNextOpenOrder,
  LoadProject,
  PersistProcessToTask,
} from './ports.js';
export type HandleProcessCaptureToTaskDeps = {
  loadCapture: LoadCapture;
  loadList: LoadNamedList;
  loadProject: LoadProject;
  loadNextOpenOrder: LoadNextOpenOrder;
  persist: PersistProcessToTask;
  nextId: () => string;
  now: () => string;
};

export type ProcessCaptureToTaskError =
  | CaptureStorageError
  | CaptureNotFoundError
  | CaptureNotInInboxError
  | CreateTaskError;

export const handleProcessCaptureToTask = (
  command: ProcessCaptureToTaskCommand,
  deps: HandleProcessCaptureToTaskDeps
): ResultAsync<Task, ProcessCaptureToTaskError> => {
  const loadedList = command.listId ? deps.loadList(command.listId) : okAsync(null);
  const loadedProject = command.projectId ? deps.loadProject(command.projectId) : okAsync(null);

  return deps.loadCapture(command.id).andThen((capture) =>
    loadedList.andThen((list) =>
      loadedProject.andThen((project) => {
        const destListId = command.listId ?? null;
        return deps.loadNextOpenOrder(command.organizationId, destListId).andThen((nextOpenOrder) => {
          const now = deps.now();
          const decision = decideProcessCaptureToTask({
            command,
            capture,
            list,
            project,
            assigneeInOrganization: null,
            nextOpenOrder,
            id: deps.nextId(),
            now,
          });

          if (decision.isErr()) {
            return errAsync(decision.error);
          }

          const plan = planTaskChange({
            event: decision.value.taskCreated,
            current: null,
            actor: command.actor,
            ids: { recordId: deps.nextId() },
          });

          return deps
            .persist({
              task: plan,
              capture: {
                id: decision.value.captureProcessed.id,
                organizationId: decision.value.captureProcessed.organizationId,
                processedAt: decision.value.captureProcessed.processedAt,
                processedToType: decision.value.captureProcessed.processedToType,
                processedToId: decision.value.captureProcessed.processedToId,
              },
            })
            .map(() => plan.view);
        });
      })
    )
  );
};
