import { ResultAsync } from 'neverthrow';
import type { ImportPreview, ImportProject, StagedImport } from '@yoink/api-contracts';
import type { ListImportsError } from '../domain/project-errors.js';
import type { ListPendingImports, LoadUserName } from './ports.js';

export type HandleListImportsDeps = {
  listPending: ListPendingImports;
  loadUserName: LoadUserName;
};

const summaryPreview = (projects: readonly ImportProject[]): ImportPreview => ({
  projects: [],
  totals: {
    projectCount: projects.length,
    existingTaskCount: projects.reduce(
      (sum, project) => sum + (project.existingTaskIds?.length ?? 0),
      0
    ),
    newTaskCount: projects.reduce((sum, project) => sum + (project.newTasks?.length ?? 0), 0),
    projectsWithNoNextAction: projects.filter((project) => project.nextAction == null).length,
  },
});

export const handleListImports = (
  query: { organizationId: string },
  deps: HandleListImportsDeps
): ResultAsync<{ imports: StagedImport[] }, ListImportsError> => {
  return deps.listPending(query.organizationId).andThen((pending) =>
    ResultAsync.combine(
      pending.map((record) =>
        deps.loadUserName(record.createdById).map((createdByName) => ({
          id: record.id,
          status: record.status,
          createdById: record.createdById,
          createdByName,
          createdAt: record.createdAt,
          decidedById: record.decidedById,
          decidedAt: record.decidedAt,
          preview: summaryPreview(record.projects),
          errors: [],
        }))
      )
    ).map((imports) => ({ imports }))
  );
};
