import type { Task } from '../../domain/model/task.js';
import { errAsync, type ResultAsync } from 'neverthrow';

import type { ListOpenTasksOnProjectQuery } from '../../domain/messages/project-queries.js';
import type { ListOpenTasksOnProjectError } from '../../domain/messages/project-errors.js';
import { projectNotFoundError } from '../../domain/messages/project-errors.js';
import { resolveListLimit } from '../../../../kernel/listing/domain/list-kind.js';
import { projectTaskCursor } from '../../../../kernel/listing/domain/list-keys.js';
import { runListedQuery } from '../../../../kernel/listing/application/run-listed-query.js';
import type { ListedPage } from '../../../../kernel/listing/domain/listed-page.js';
import type { LoadProject, PageOpenTasksOnProject } from '../ports.js';

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
