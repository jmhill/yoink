import { errAsync, type ResultAsync } from 'neverthrow';
import type { Actor } from '../../shared/auth-context.js';
import type { StagedImport } from '@yoink/api-contracts';
import { decideImport } from '../domain/decide-import.js';
import { importNotFoundError, type GetImportError } from '../domain/project-errors.js';
import { loadImportContext, type LoadImportContextDeps } from './load-import-context.js';
import type { LoadStagedImport, LoadUserName } from './ports.js';

export type HandleGetImportDeps = LoadImportContextDeps & {
  loadImport: LoadStagedImport;
  loadUserName: LoadUserName;
};

export const handleGetImport = (
  query: { id: string; organizationId: string; actor: Actor; createdById: string },
  deps: HandleGetImportDeps
): ResultAsync<StagedImport, GetImportError> => {
  return deps.loadImport(query.id).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== query.organizationId) {
      return errAsync(importNotFoundError(query.id));
    }

    return loadImportContext(
      {
        projects: loaded.projects,
        organizationId: query.organizationId,
        createdById: query.createdById,
        actor: query.actor,
      },
      deps
    ).andThen((context) => {
      const decision = decideImport(context);
      return deps.loadUserName(loaded.createdById).map((createdByName) => ({
        id: loaded.id,
        status: loaded.status,
        createdById: loaded.createdById,
        createdByName,
        createdAt: loaded.createdAt,
        decidedById: loaded.decidedById,
        decidedAt: loaded.decidedAt,
        preview: decision.isOk() ? decision.value.preview : null,
        errors: decision.isErr() ? [...decision.error.errors] : [],
      }));
    });
  });
};
