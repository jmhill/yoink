import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Project, Task } from '@yoink/api-contracts';
import type { ChangeLogKind } from '../../shared/change-log/domain/kinds.js';
import type { OrgPrincipalLookup } from '../../tasks/domain/org-principal-lookup.js';
import { decideCreateTask } from '../../tasks/domain/decide-create.js';
import { planTaskChange } from '../../tasks/domain/plan-task-change.js';
import { parseTaskTitle } from '../../tasks/domain/task-title.js';
import type { SetProjectNextActionCommand } from '../domain/project-commands.js';
import {
  assigneeNotInOrganizationError,
  listNotInOrganizationError,
  openTaskPlanFailedError,
  projectDoneError,
  projectNotFoundError,
  taskTitleBlankError,
  taskTitleTooLongError,
  type SetProjectNextActionError,
} from '../domain/project-errors.js';
import { decideSetNextAction } from '../domain/decide-set-next-action.js';
import { planProjectChange } from '../domain/plan-project-change.js';
import type {
  LoadNamedList,
  LoadNextOpenOrder,
  LoadProject,
  LoadTask,
  PersistSetNextAction,
} from './ports.js';

export type HandleSetNextActionDeps = {
  load: LoadProject;
  loadTask: LoadTask;
  loadList: LoadNamedList;
  loadNextOpenOrder: LoadNextOpenOrder;
  persistSetNextAction: PersistSetNextAction;
  principalLookup?: OrgPrincipalLookup;
  nextId: () => string;
  now: () => string;
};

export type SetNextActionResult = {
  view: Project;
  task?: Task;
  eventKinds: ChangeLogKind[];
};

export const handleSetNextAction = (
  command: SetProjectNextActionCommand,
  deps: HandleSetNextActionDeps
): ResultAsync<SetNextActionResult, SetProjectNextActionError> => {
  return deps.load(command.id).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== command.organizationId) {
      return errAsync(projectNotFoundError(command.id));
    }

    if (command.type === 'newTask') {
      return handleNewTask(loaded, command, deps);
    }

    const loadedTask =
      command.type === 'clear' ? okAsync(null) : deps.loadTask(command.taskId);

    return loadedTask.andThen((task) => {
      const decision = decideSetNextAction({
        project: loaded,
        task,
        command,
        now: deps.now(),
      });
      if (decision.isErr()) {
        return errAsync(decision.error);
      }
      if (decision.value.type === 'unchanged') {
        return okAsync({
          view: loaded,
          ...(task ? { task } : {}),
          eventKinds: [],
        });
      }

      const projectPlan = planProjectChange({
        event: decision.value.event,
        current: loaded,
        actor: command.actor,
        ids: { recordId: deps.nextId() },
      });
      return deps.persistSetNextAction({ project: projectPlan, tasks: [] }).map(() => ({
        view: projectPlan.view,
        ...(task ? { task } : {}),
        eventKinds: projectPlan.records.map((record) => record.kind),
      }));
    });
  });
};

const handleNewTask = (
  project: Project,
  command: Extract<SetProjectNextActionCommand, { type: 'newTask' }>,
  deps: HandleSetNextActionDeps
): ResultAsync<SetNextActionResult, SetProjectNextActionError> => {
  const newTask = command.newTask;
  const parsedTitle = parseTaskTitle(newTask.title);
  if (parsedTitle.isErr()) {
    return errAsync(
      parsedTitle.error.type === 'TASK_TITLE_BLANK'
        ? taskTitleBlankError()
        : taskTitleTooLongError()
    );
  }
  const title = parsedTitle.value;

  const loadedList = newTask.listId ? deps.loadList(newTask.listId) : okAsync(null);
  const destListId = newTask.listId ?? null;

  return loadedList.andThen((list) =>
    deps.loadNextOpenOrder(command.organizationId, destListId).andThen((nextOpenOrder) => {
      const assigneeCheck: ResultAsync<boolean | null, SetProjectNextActionError> =
        newTask.assigneeId === undefined
          ? okAsync(null)
          : deps.principalLookup
            ? deps.principalLookup.existsInOrganization(
                newTask.assigneeId,
                command.organizationId
              )
            : okAsync(false);

      return assigneeCheck.andThen((assigneeInOrganization) => {
        const now = deps.now();
        const createdId = deps.nextId();
        const createDecision = decideCreateTask({
          command: {
            title,
            dueDate: newTask.dueDate,
            organizationId: command.organizationId,
            createdById: command.actor.userId,
            assigneeId: newTask.assigneeId,
            listId: newTask.listId,
            projectId: project.id,
            actor: command.actor,
          },
          list,
          project,
          assigneeInOrganization,
          nextOpenOrder,
          id: createdId,
          now,
        });
        if (createDecision.isErr()) {
          switch (createDecision.error.type) {
            case 'PROJECT_DONE':
              return errAsync(projectDoneError(project.id));
            case 'PROJECT_NOT_IN_ORGANIZATION':
              return errAsync(projectNotFoundError(project.id));
            case 'LIST_NOT_IN_ORGANIZATION':
              return errAsync(
                listNotInOrganizationError(
                  createDecision.error.listId,
                  createDecision.error.organizationId
                )
              );
            case 'ASSIGNEE_NOT_IN_ORGANIZATION':
              return errAsync(
                assigneeNotInOrganizationError(
                  createDecision.error.assigneeId,
                  createDecision.error.organizationId
                )
              );
            default:
              return errAsync(
                openTaskPlanFailedError(createdId, createDecision.error)
              );
          }
        }

        const taskPlan = planTaskChange({
          event: createDecision.value,
          current: null,
          actor: command.actor,
          ids: { recordId: deps.nextId() },
        });

        const setDecision = decideSetNextAction({
          project,
          task: taskPlan.view,
          command: {
            type: 'set',
            id: command.id,
            organizationId: command.organizationId,
            taskId: taskPlan.view.id,
            actor: command.actor,
          },
          now,
        });
        if (setDecision.isErr()) {
          return errAsync(setDecision.error);
        }
        if (setDecision.value.type !== 'set') {
          return errAsync(openTaskPlanFailedError(taskPlan.view.id, setDecision.value));
        }

        const projectPlan = planProjectChange({
          event: setDecision.value.event,
          current: project,
          actor: command.actor,
          ids: { recordId: deps.nextId() },
        });

        return deps
          .persistSetNextAction({ project: projectPlan, tasks: [taskPlan] })
          .map(() => ({
            view: projectPlan.view,
            task: taskPlan.view,
            eventKinds: [
              ...taskPlan.records.map((record) => record.kind),
              ...projectPlan.records.map((record) => record.kind),
            ],
          }));
      });
    })
  );
};
