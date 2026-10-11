import { errAsync, type ResultAsync } from 'neverthrow';
import type { Actor } from '../../shared/auth-context.js';
import type { ImportProject, StagedImport } from '@yoink/api-contracts';
import { decideImport } from '../domain/decide-import.js';
import type { StageImportError } from '../domain/project-errors.js';
import { loadImportContext, type LoadImportContextDeps } from './load-import-context.js';
import type { LoadUserName, PersistStagedImport } from './ports.js';

export type HandleStageImportDeps = LoadImportContextDeps & {
  persistStage: PersistStagedImport;
  loadUserName: LoadUserName;
};

export type StageImportCommand = {
  projects: readonly ImportProject[];
  organizationId: string;
  createdById: string;
  actor: Actor;
};

export const handleStageImport = (
  command: StageImportCommand,
  deps: HandleStageImportDeps
): ResultAsync<StagedImport, StageImportError> => {
  return loadImportContext(command, deps).andThen((context) => {
    const decision = decideImport(context);
    if (decision.isErr()) {
      return errAsync(decision.error);
    }

    const id = deps.nextId();
    const createdAt = context.now;
    return deps
      .persistStage({
        id,
        organizationId: command.organizationId,
        createdById: command.createdById,
        createdAt,
        status: 'pending',
        projects: [...command.projects],
        decidedById: null,
        decidedAt: null,
      })
      .andThen(() =>
        deps.loadUserName(command.createdById).map((createdByName) => ({
          id,
          status: 'pending' as const,
          createdById: command.createdById,
          createdByName,
          createdAt,
          decidedById: null,
          decidedAt: null,
          preview: decision.value.preview,
          errors: [],
        }))
      );
  });
};
