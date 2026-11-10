import type { Project } from '../domain/model/project-document.js';
import { errAsync, okAsync, type ResultAsync } from 'neverthrow';

import type { Actor } from '../../../kernel/auth-context.js';
import type { Work } from '../../../kernel/unit-of-work.js';
import type { CreateProjectCommand } from '../domain/messages/project-commands.js';
import type { CreateProjectError } from '../domain/messages/project-errors.js';
import type { CreateTaskCommand } from '../domain/messages/task-commands.js';
import type { CreateTaskError } from '../domain/messages/task-errors.js';
import type { ProjectCreated } from '../domain/messages/project-events.js';
import type { TaskCreated } from '../domain/messages/task-events.js';
import { decideCreateProject } from '../domain/decisions/decide-create-project.js';
import { decideCreateTask } from '../domain/decisions/decide-create-task.js';
import { planProjectChange } from '../domain/projections/plan-project-change.js';
import { planTaskChange } from '../domain/projections/plan-task-change.js';
import type { OrgPrincipalLookup } from '../domain/model/org-principal-lookup.js';
import type { ListProjects, LoadNamedList, LoadNextOpenOrder, LoadProject } from './ports.js';
import { projectWork, taskWork } from './support/commit-task-management.js';
import { kindsFromRecords, type WriteResult } from './support/write-result.js';

export type TaskStarter = Omit<CreateTaskCommand, 'actor'>;

export type ProjectStarter = Omit<CreateProjectCommand, 'actor'>;

export type PrepareCreateDeps = {
  listProjects: ListProjects;
  loadNamedList: LoadNamedList;
  loadProject: LoadProject;
  loadNextOpenOrder: LoadNextOpenOrder;
  principalLookup: OrgPrincipalLookup;
  nextId: () => string;
  now: () => string;
};

export type PreparedProject = {
  event: ProjectCreated;
  view: Project;
};

/**
 * Decide and plan a task without committing. Processing will commit this
 * work together with the capture update.
 */
export const prepareCreateTask = (
  starter: TaskStarter,
  actor: Actor,
  deps: PrepareCreateDeps
): ResultAsync<Work<WriteResult<TaskCreated>>, CreateTaskError> => {
  const command: CreateTaskCommand = { ...starter, actor };
  const loadedList = command.listId ? deps.loadNamedList(command.listId) : okAsync(null);
  const loadedProject = command.projectId ? deps.loadProject(command.projectId) : okAsync(null);

  return loadedList.andThen((list) =>
    loadedProject.andThen((project) =>
      deps.loadNextOpenOrder(command.organizationId, command.listId ?? null).andThen((nextOpenOrder) => {
        const assigneeCheck =
          command.assigneeId !== undefined
            ? deps.principalLookup.existsInOrganization(command.assigneeId, command.organizationId)
            : okAsync(null as boolean | null);

        return assigneeCheck.andThen((assigneeInOrganization) => {
          const now = deps.now();
          const decision = decideCreateTask({
            command,
            list,
            project,
            assigneeInOrganization,
            nextOpenOrder,
            id: deps.nextId(),
            now,
          });
          if (decision.isErr()) {
            return errAsync(decision.error);
          }
          const event = decision.value;
          const plan = planTaskChange({
            event,
            current: null,
            actor,
            ids: { recordId: deps.nextId() },
          });
          const prepared = taskWork(plan);
          return okAsync({
            ...prepared,
            result: {
              event,
              view: plan.view,
              eventKinds: kindsFromRecords(plan.records),
            },
          });
        });
      })
    )
  );
};

export const prepareCreateProject = (
  starter: ProjectStarter,
  actor: Actor,
  deps: PrepareCreateDeps
): ResultAsync<Work<PreparedProject>, CreateProjectError> =>
  deps.listProjects(starter.organizationId).andThen((existing) => {
    const now = deps.now();
    const command: CreateProjectCommand = { ...starter, actor };
    const decision = decideCreateProject({
      command,
      existingNames: existing
        .filter((project) => project.status !== 'declined')
        .map((project) => project.name),
      id: deps.nextId(),
      now,
    });
    if (decision.isErr()) {
      return errAsync(decision.error);
    }
    const event = decision.value;
    const plan = planProjectChange({
      event,
      current: null,
      actor,
      ids: { recordId: deps.nextId() },
    });
    const prepared = projectWork(plan);
    return okAsync({
      ...prepared,
      result: { event, view: plan.view },
    });
  });
