import { implement } from '@orpc/server';
import { webReviewContract } from '@yoink/api-contracts/web';
import type { ReviewHandlers } from '../../modules/review/index.js';
import { toContractDonePage, toContractReviewPage } from '../_shared/map-review-document.js';
import type { OrpcHttpContext } from '../_shared/orpc/http-context.js';
import { mapListDoneError, mapListReviewError } from './review-errors.js';

/**
 * Methods this screen calls. The rest of the handler stays off the port.
 */
export type WebReviewDependencies = {
  reviewHandlers: Pick<ReviewHandlers, 'list' | 'done'>;
};

/**
 * Review attention and the done week. Each handler calls one review query.
 * The edge copies the document onto the contract page and does not sort.
 * Public v1 and the `/api` alias keep today's paths, status, and error body.
 */
export const createWebReviewHandlers = (deps: WebReviewDependencies) => {
  const review = implement(webReviewContract).$context<OrpcHttpContext>();

  return review.router({
    list: review.list.handler(async ({ input, context }) => {
      const result = await deps.reviewHandlers.list({
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
        timeZone: input.timeZone,
      });
      return result.match(
        (page) => toContractReviewPage(page),
        (error) => {
          throw mapListReviewError(error);
        }
      );
    }),
    done: review.done.handler(async ({ input, context }) => {
      const result = await deps.reviewHandlers.done({
        organizationId: context.request.authContext.organizationId,
        week: input.week,
        limit: input.limit,
        cursor: input.cursor,
      });
      return result.match(
        (page) => toContractDonePage(page),
        (error) => {
          throw mapListDoneError(error);
        }
      );
    }),
  });
};
