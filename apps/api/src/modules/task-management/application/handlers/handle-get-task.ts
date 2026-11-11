import type { Task } from '../../domain/model/task.js';
import type { ResultAsync } from 'neverthrow';

import type { FindTaskQuery } from '../../domain/messages/task-commands.js';
import type { FindTaskError } from '../../domain/messages/task-errors.js';
import type { LoadTask } from '../ports.js';
import { loadOwnedTask } from '../support/load-owned-task.js';

export type HandleGetTaskDeps = {
  load: LoadTask;
};

/** Read one task in the caller's organization. Missing and other-organization rows are the same refusal. */
export const handleGetTask = (
  query: FindTaskQuery,
  deps: HandleGetTaskDeps
): ResultAsync<Task, FindTaskError> =>
  loadOwnedTask({
    id: query.id,
    organizationId: query.organizationId,
    load: deps.load,
  });
