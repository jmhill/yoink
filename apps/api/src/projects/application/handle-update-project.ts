import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { UpdateProjectCommand } from '../domain/project-commands.js';
import type { ProjectUpdated } from '../domain/events.js';
import { projectNotFoundError, type UpdateProjectError } from '../domain/project-errors.js';
import { decideUpdateProject } from '../domain/decide-update.js';
import { planProjectChange } from '../domain/plan-project-change.js';
import type { ListProjects, LoadProject, PersistProjectChange } from './ports.js';

export type HandleUpdateProjectDeps = {
  load: LoadProject;
  list: ListProjects;
  persist: PersistProjectChange;
  nextId: () => string;
  now: () => string;
};

export type UpdateProjectResult = {
  event?: ProjectUpdated;
  view: Project;
};

export const handleUpdateProject = (
  command: UpdateProjectCommand,
  deps: HandleUpdateProjectDeps
): ResultAsync<UpdateProjectResult, UpdateProjectError> => {
  return deps.load(command.id).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== command.organizationId) {
      return errAsync(projectNotFoundError(command.id));
    }

    return deps.list(command.organizationId).andThen((existing) => {
      const decision = decideUpdateProject({
        command,
        current: loaded,
        existingNames: existing.map((project) => project.name),
        now: deps.now(),
      });

      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      if (decision.value.type === 'unchanged') {
        return okAsync({ view: loaded });
      }

      const event = decision.value.event;
      const plan = planProjectChange({
        event,
        current: loaded,
        actor: command.actor,
        ids: { recordId: deps.nextId() },
      });

      return deps.persist(plan).map(() => ({ event, view: plan.view }));
    });
  });
};
