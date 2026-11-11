import type { Project } from '../../domain/model/project-document.js';
import { errAsync, okAsync, type ResultAsync } from 'neverthrow';

import type { UpdateProjectCommand } from '../../domain/messages/project-commands.js';
import type { ProjectUpdated } from '../../domain/messages/project-events.js';
import { projectNotFoundError, type UpdateProjectError } from '../../domain/messages/project-errors.js';
import { decideUpdateProject } from '../../domain/decisions/decide-update-project.js';
import { planProjectChange } from '../../domain/projections/plan-project-change.js';
import type { ListProjects, LoadProject, PersistProjectChange } from '../ports.js';

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
        existingNames: existing
          .filter((project) => project.status !== 'declined')
          .map((project) => project.name),
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
