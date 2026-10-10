import { errAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { ListOpenTasksOnProjectQuery } from '../domain/project-queries.js';
import type { ListOpenTasksOnProjectError } from '../domain/project-errors.js';
import { projectNotFoundError } from '../domain/project-errors.js';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { projectTaskCursor } from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import type { LoadProject, PageOpenTasksOnProject } from './ports.js';

export type HandleListOpenTasksOnProjectDeps = {
  load: LoadProject;
  pageOpenTasksOnProject: PageOpenTasksOnProject;
};

export const handleListOpenTasksOnProject = (
  query: ListOpenTasksOnProjectQuery,
  deps: HandleListOpenTasksOnProjectDeps
): ResultAsync<ListedPage<Task>, ListOpenTasksOnProjectError> => {
  return deps.load(query.projectId).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== query.organizationId) {
      return errAsync(projectNotFoundError(query.projectId));
    }

    return runListedQuery({
      cursor: query.cursor,
      cursorOf: projectTaskCursor,
      limit: resolveListLimit(query.limit, 'pile'),
      load: (seek, fetchLimit) =>
        deps.pageOpenTasksOnProject({
          organizationId: query.organizationId,
          projectId: query.projectId,
          fetchLimit,
          seek,
        }),
    });
  });
};
