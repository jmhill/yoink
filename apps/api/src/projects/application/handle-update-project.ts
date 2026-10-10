import { errAsync, type ResultAsync } from 'neverthrow';
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
  event: ProjectUpdated;
  view: Project;
};

export const handleUpdateProject = (
  command: UpdateProjectCommand,
  deps: HandleUpdateProjectDeps
): ResultAsync<UpdateProjectResult, UpdateProjectError> => {
  return deps.load(command.id).andThen((loaded) => {
    const current =
      loaded && loaded.organizationId === command.organizationId ? loaded : null;

    const persistDecision = (existingNames: readonly string[]) => {
      const now = deps.now();
      const decision = decideUpdateProject({
        command,
        current,
        existingNames,
        now,
      });

      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      if (current === null) {
        return errAsync(projectNotFoundError(command.id));
      }

      const event = decision.value;
      const plan = planProjectChange({
        event,
        current,
        actor: command.actor,
        ids: { recordId: deps.nextId() },
      });

      return deps.persist(plan).map(() => ({ event, view: plan.view }));
    };

    if (!current) {
      return persistDecision([]);
    }

    return deps
      .list(command.organizationId)
      .andThen((existing) => persistDecision(existing.map((project) => project.name)));
  });
};
