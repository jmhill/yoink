import { ResultAsync } from 'neverthrow';
import type { StagedImport } from '@yoink/api-contracts';
import type { ListImportsError } from '../domain/project-errors.js';
import { decideImport } from '../domain/decide-import.js';
import { loadImportContext, type LoadImportContextDeps } from './load-import-context.js';
import type { ListPendingImports, LoadUserName } from './ports.js';
import type { Actor } from '../../shared/auth-context.js';

export type HandleListImportsDeps = LoadImportContextDeps & {
  listPending: ListPendingImports;
  loadUserName: LoadUserName;
};

export const handleListImports = (
  query: { organizationId: string; actor: Actor; createdById: string },
  deps: HandleListImportsDeps
): ResultAsync<{ imports: StagedImport[] }, ListImportsError> => {
  return deps.listPending(query.organizationId).andThen((pending) =>
    ResultAsync.combine(
      pending.map((record) =>
        loadImportContext(
          {
            projects: record.projects,
            organizationId: query.organizationId,
            createdById: query.createdById,
            actor: query.actor,
          },
          deps
        ).andThen((context) => {
          const decision = decideImport(context);
          return deps.loadUserName(record.createdById).map((createdByName) => ({
            id: record.id,
            status: record.status,
            createdById: record.createdById,
            createdByName,
            createdAt: record.createdAt,
            decidedById: record.decidedById,
            decidedAt: record.decidedAt,
            preview: decision.isOk() ? decision.value.preview : null,
            errors: decision.isErr() ? [...decision.error.errors] : [],
          }));
        })
      )
    ).map((imports) => ({ imports }))
  );
};
