import { implement } from '@orpc/server';
import { webHistoryContract } from '@yoink/api-contracts/web';
import type { HistoryHandlers } from '../../modules/history/index.js';
import { toContractHistoryPage, toHistoryTaskListBody } from '../_shared/map-history-document.js';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';
import { mapListFinishedTasksError, mapListProjectHistoryError } from './history-errors.js';

/**
 * Methods this screen calls. The rest of the handler stays off the port.
 */
export type WebHistoryDependencies = {
  historyHandlers: Pick<HistoryHandlers, 'listProjectHistory' | 'listFinishedTasks'>;
};

/**
 * Project history and finished tasks. Each handler calls one history query.
 * The edge copies the document onto the contract page and does not sort.
 * Public v1 and the `/api` alias keep today's paths, status, and error body.
 */
export const createWebHistoryHandlers = (deps: WebHistoryDependencies) => {
  const history = implement(webHistoryContract).$context<OrpcHttpContext>();

  return history.router({
    listProjectHistory: history.listProjectHistory.handler(async ({ input, context }) => {
      const result = await deps.historyHandlers.listProjectHistory({
        projectId: input.id,
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
      });
      return result.match(
        (page) => toContractHistoryPage(page),
        (error) => {
          throw mapListProjectHistoryError(error);
        }
      );
    }),
    listFinishedTasks: history.listFinishedTasks.handler(async ({ input, context }) => {
      const result = await deps.historyHandlers.listFinishedTasks({
        projectId: input.id,
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
      });
      return result.match(
        (page) => toHistoryTaskListBody(page),
        (error) => {
          throw mapListFinishedTasksError(error);
        }
      );
    }),
  });
};
