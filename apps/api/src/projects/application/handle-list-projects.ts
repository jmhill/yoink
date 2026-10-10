import type { ResultAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { ListProjectsQuery } from '../domain/project-queries.js';
import type { ListProjectsError } from '../domain/project-errors.js';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { projectCursor } from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import type { PageProjects } from './ports.js';

export type HandleListProjectsDeps = {
  pageProjects: PageProjects;
};

export const handleListProjects = (
  query: ListProjectsQuery,
  deps: HandleListProjectsDeps
): ResultAsync<ListedPage<Project>, ListProjectsError> => {
  return runListedQuery({
    cursor: query.cursor,
    cursorOf: projectCursor,
    limit: resolveListLimit(query.limit, 'pile'),
    load: (seek, fetchLimit) =>
      deps.pageProjects({
        organizationId: query.organizationId,
        fetchLimit,
        seek,
      }),
  });
};
