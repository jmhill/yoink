import type { AppliedImport } from '../../domain/model/import-document.js';
import { errAsync, type ResultAsync } from 'neverthrow';
import type { Actor } from '../../../../kernel/auth-context.js';

import { requirePerson } from '../../../../kernel/auth-context.js';
import { decideImport } from '../../domain/decisions/decide-import.js';
import { planImport } from '../../domain/projections/plan-project-import.js';
import {
  importNotFoundError,
  importNotPendingError,
  importRequiresPersonError,
  type ApplyImportError,
} from '../../domain/messages/project-errors.js';
import { loadImportContext, type LoadImportContextDeps } from '../support/load-import-context.js';
import type { LoadStagedImport, PersistImportApply } from '../ports.js';

export type HandleApplyImportDeps = LoadImportContextDeps & {
  loadImport: LoadStagedImport;
  persistApply: PersistImportApply;
};

export const handleApplyImport = (
  command: { id: string; organizationId: string; actor: Actor },
  deps: HandleApplyImportDeps
): ResultAsync<AppliedImport, ApplyImportError> => {
  const person = requirePerson(command.actor);
  if (person.isErr()) {
    return errAsync(importRequiresPersonError());
  }

  return deps.loadImport(command.id).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== command.organizationId) {
      return errAsync(importNotFoundError(command.id));
    }
    if (loaded.status !== 'pending') {
      return errAsync(importNotPendingError());
    }

    return loadImportContext(
      {
        projects: loaded.projects,
        organizationId: command.organizationId,
        createdById: person.value.userId,
        actor: command.actor,
      },
      deps
    ).andThen((context) => {
      const decision = decideImport(context);
      if (decision.isErr()) {
        return errAsync(decision.error);
      }

      const write = planImport(decision.value, deps.nextId);
      const decidedAt = context.now;
      return deps
        .persistApply({
          write,
          stagedImportId: loaded.id,
          decidedById: person.value.userId,
          decidedAt,
        })
        .map(() => ({
          id: loaded.id,
          status: 'applied' as const,
          preview: decision.value.preview,
          projects: write.projects,
        }));
    });
  });
};
