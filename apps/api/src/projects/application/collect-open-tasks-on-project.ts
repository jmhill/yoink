import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { Task } from '@yoink/api-contracts';
import type { KeysetCursor } from '../../listing/domain/keyset-cursor.js';
import { projectTaskCursor } from '../../listing/domain/list-keys.js';
import {
  openTasksUnreadError,
  type OpenTasksUnreadError,
  type StorageError,
} from '../domain/project-errors.js';
import type { PageOpenTasksOnProject } from './ports.js';

export const collectAllOpenTasksOnProject = (input: {
  page: PageOpenTasksOnProject;
  organizationId: string;
  projectId: string;
  fetchLimit: number;
}): ResultAsync<Task[], StorageError | OpenTasksUnreadError> => {
  const step = (
    collected: Task[],
    seek?: KeysetCursor
  ): ResultAsync<Task[], StorageError | OpenTasksUnreadError> =>
    input
      .page({
        organizationId: input.organizationId,
        projectId: input.projectId,
        fetchLimit: input.fetchLimit,
        seek,
      })
      .andThen((page) => {
        const rows = [...collected, ...page.rows];
        if (rows.length === page.total) {
          return okAsync(rows);
        }
        if (page.rows.length === 0 || page.rows.length < input.fetchLimit) {
          return errAsync(openTasksUnreadError(page.total, rows.length));
        }
        const last = page.rows[page.rows.length - 1];
        if (!last) {
          return errAsync(openTasksUnreadError(page.total, rows.length));
        }
        return step(rows, projectTaskCursor.of(last));
      });

  return step([]);
};
