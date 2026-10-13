import { errAsync, type ResultAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { ChangeLogKind } from '../../shared/change-log/domain/kinds.js';
import type { DeclineProposedProjectCommand } from '../domain/project-commands.js';
import {
  projectNotFoundError,
  storageError,
  type DeclineProposedProjectError,
} from '../domain/project-errors.js';
import { decideDeclineProposal } from '../domain/decide-decline-proposal.js';
import { planProjectChange } from '../domain/plan-project-change.js';
import type { LoadProject, PersistProjectChange } from './ports.js';

export type HandleDeclineProposalDeps = {
  load: LoadProject;
  persist: PersistProjectChange;
  nextId: () => string;
  now: () => string;
};

export type DeclineProposalResult = {
  view: Project;
  eventKinds: ChangeLogKind[];
};

export const handleDeclineProposal = (
  command: DeclineProposedProjectCommand,
  deps: HandleDeclineProposalDeps
): ResultAsync<DeclineProposalResult, DeclineProposedProjectError> => {
  return deps.load(command.id).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== command.organizationId) {
      return errAsync(projectNotFoundError(command.id));
    }

    const decision = decideDeclineProposal({
      project: loaded,
      command,
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

    return deps
      .persist(plan)
      .mapErr((error) =>
        error.type === 'DUPLICATE_PROJECT_NAME'
          ? storageError('Decline cannot conflict on name')
          : error
      )
      .map(() => ({
        view: plan.view,
        eventKinds: plan.records.map((record) => record.kind),
      }));
  });
};
