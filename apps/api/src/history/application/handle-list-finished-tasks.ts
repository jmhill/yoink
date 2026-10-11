import { errAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { InvalidCursorError } from '../../listing/domain/invalid-cursor.js';
import { resolveListLimit } from '../../listing/domain/list-kind.js';
import { asFinishedTask, finishedProjectTaskCursor } from '../../listing/domain/list-keys.js';
import { runListedQuery } from '../../listing/application/run-listed-query.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import {
  projectNotFoundError,
  type ProjectNotFoundError,
  type StorageError,
} from '../../projects/domain/project-errors.js';
import type { ListFinishedTasksOnProjectQuery } from '../domain/queries.js';
import type { LoadProject, PageFinishedTasksInProject } from './ports.js';

export type ListFinishedTasksOnProjectError =
  | ProjectNotFoundError
  | InvalidCursorError
  | StorageError;

export type HandleListFinishedTasksOnProjectDeps = {
  load: LoadProject;
  pageFinishedTasksInProject: PageFinishedTasksInProject;
};

export const handleListFinishedTasksOnProject = (
  query: ListFinishedTasksOnProjectQuery,
  deps: HandleListFinishedTasksOnProjectDeps
): ResultAsync<ListedPage<Task>, ListFinishedTasksOnProjectError> => {
  return deps.load(query.projectId).andThen((loaded) => {
    if (!loaded || loaded.organizationId !== query.organizationId) {
      return errAsync(projectNotFoundError(query.projectId));
    }

    return runListedQuery({
      cursor: query.cursor,
      cursorOf: finishedProjectTaskCursor,
      limit: resolveListLimit(query.limit, 'history'),
      load: (seek, fetchLimit) =>
        deps
          .pageFinishedTasksInProject({
            organizationId: query.organizationId,
            projectId: query.projectId,
            fetchLimit,
            seek,
            completedAfter: query.completedAfter,
            completedBefore: query.completedBefore,
          })
          .map((page) => ({
            ...page,
            rows: page.rows.flatMap((task) => {
              const finished = asFinishedTask(task);
              return finished ? [finished] : [];
            }),
          })),
    });
  });
};
