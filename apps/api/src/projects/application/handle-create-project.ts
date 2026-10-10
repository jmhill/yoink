import { errAsync, type ResultAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { CreateProjectCommand } from '../domain/project-commands.js';
import type { ProjectCreated } from '../domain/events.js';
import { type CreateProjectError } from '../domain/project-errors.js';
import { decideCreateProject } from '../domain/decide-create.js';
import { planProjectChange } from '../domain/plan-project-change.js';
import type { ListProjects, PersistProjectChange } from './ports.js';

export type HandleCreateProjectDeps = {
  list: ListProjects;
  persist: PersistProjectChange;
  nextId: () => string;
  now: () => string;
};

export type CreateProjectResult = {
  event: ProjectCreated;
  view: Project;
};

export const handleCreateProject = (
  command: CreateProjectCommand,
  deps: HandleCreateProjectDeps
): ResultAsync<CreateProjectResult, CreateProjectError> => {
  return deps.list(command.organizationId).andThen((existing) => {
    const now = deps.now();
    const decision = decideCreateProject({
      command,
      existingNames: existing.map((project) => project.name),
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
      actor: command.actor,
      ids: { recordId: deps.nextId() },
    });

    return deps.persist(plan).map(() => ({
      event,
      view: plan.view,
    }));
  });
};
