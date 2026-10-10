import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { GetProjectQuery } from '../domain/project-queries.js';
import { projectNotFoundError, type GetProjectError } from '../domain/project-errors.js';
import type { LoadProject } from './ports.js';

export type HandleGetProjectDeps = {
  load: LoadProject;
};

export const handleGetProject = (
  query: GetProjectQuery,
  deps: HandleGetProjectDeps
): ResultAsync<Project, GetProjectError> => {
  return deps.load(query.id).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== query.organizationId) {
      return errAsync(projectNotFoundError(query.id));
    }

    return okAsync(loaded);
  });
};
