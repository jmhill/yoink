import type { ResultAsync } from 'neverthrow';
import { errAsync } from 'neverthrow';
import type { Project } from '@yoink/api-contracts';
import type { ListProjectsQuery } from '../../domain/messages/project-queries.js';
import type { ListProjectsError } from '../../domain/messages/project-errors.js';
import { resolveListLimit } from '../../../../kernel/listing/domain/list-kind.js';
import { projectCursor } from '../../../../kernel/listing/domain/list-keys.js';
import { runListedQuery } from '../../../../kernel/listing/application/run-listed-query.js';
import type { ListedPage } from '../../../../kernel/listing/domain/listed-page.js';
import type { PageProjects } from '../ports.js';
import {
  listIncludesProposalStatuses,
  parseProjectStatusFilter,
} from '../../domain/rules/project-status-filter.js';

export type HandleListProjectsDeps = {
  pageProjects: PageProjects;
};

export const handleListProjects = (
  query: ListProjectsQuery,
  deps: HandleListProjectsDeps
): ResultAsync<ListedPage<Project>, ListProjectsError> => {
  const statuses = parseProjectStatusFilter(query.status);
  if (statuses.isErr()) {
    return errAsync(statuses.error);
  }

  const createdById =
    query.createdById ??
    (query.actor.kind === 'bot' && listIncludesProposalStatuses(statuses.value)
      ? query.actor.userId
      : undefined);

  return runListedQuery({
    cursor: query.cursor,
    cursorOf: projectCursor,
    limit: resolveListLimit(query.limit, 'pile'),
    load: (seek, fetchLimit) =>
      deps.pageProjects({
        organizationId: query.organizationId,
        fetchLimit,
        seek,
        statuses: statuses.value,
        createdById,
      }),
  });
};
