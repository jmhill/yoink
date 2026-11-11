import type { Project } from '../../domain/model/project-document.js';
import { errAsync, type ResultAsync } from 'neverthrow';

import type { ChangeLogKind } from '../../../history/domain/kinds.js';
import type { RestoreDeclinedProjectCommand } from '../../domain/messages/project-commands.js';
import { projectNotFoundError, type RestoreDeclinedProjectError } from '../../domain/messages/project-errors.js';
import { decideRestoreProposal } from '../../domain/decisions/decide-restore-proposal.js';
import { planProjectChange } from '../../domain/projections/plan-project-change.js';
import { heldProjectNames } from '../../domain/rules/project-status-filter.js';
import type { ListProjects, LoadProject, PersistProjectChange } from '../ports.js';

export type HandleRestoreProposalDeps = {
  load: LoadProject;
  list: ListProjects;
  persist: PersistProjectChange;
  nextId: () => string;
  now: () => string;
};

export type RestoreProposalResult = {
  view: Project;
  eventKinds: ChangeLogKind[];
};

export const handleRestoreProposal = (
  command: RestoreDeclinedProjectCommand,
  deps: HandleRestoreProposalDeps
): ResultAsync<RestoreProposalResult, RestoreDeclinedProjectError> => {
  return deps.load(command.id).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== command.organizationId) {
      return errAsync(projectNotFoundError(command.id));
    }

    return deps.list(command.organizationId).andThen((existing) => {
      const decision = decideRestoreProposal({
        project: loaded,
        command,
        existingNames: heldProjectNames(existing),
        now: deps.now(),
      });
      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      const plan = planProjectChange({
        event: decision.value,
        current: loaded,
        actor: command.actor,
        ids: { recordId: deps.nextId() },
      });

      return deps.persist(plan).map(() => ({
        view: plan.view,
        eventKinds: plan.records.map((record) => record.kind),
      }));
    });
  });
};
