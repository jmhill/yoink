import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import type { ReviewCounts, ReviewProject } from '@yoink/api-contracts';
import { reviewOrpcContract } from '@yoink/api-contracts/orpc';
import type { FastifyInstance } from 'fastify';
import type { AuthMiddleware } from '../../access/application/index.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import { listedRequestValidationError } from '../../shared/request-validation.js';
import { dispatchOrpc } from '../../shared/orpc/dispatch.js';
import { openApiHandlerOptions } from '../../shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../shared/orpc/http-context.js';
import type { ReviewHandlers } from '../application/create-review-handlers.js';
import type { RankedReviewProject } from '../domain/review-order.js';
import { mapListDoneError, mapListReviewError } from './orpc-review-errors.js';

export type ReviewRoutesDependencies = {
  reviewHandlers: ReviewHandlers;
  authMiddleware: AuthMiddleware;
};

const toReviewBody = (
  page: ListedPage<RankedReviewProject> & { today: string; counts: ReviewCounts }
) => ({
  projects: page.items.map(
    (item): ReviewProject => ({
      project: item.project,
      reasons: item.reasons,
      lastChangeAt: item.lastChangeAt,
      daysSinceChange: item.daysSinceChange,
      daysWaiting: item.daysWaiting,
      nextAction: item.nextAction,
    })
  ),
  today: page.today,
  counts: page.counts,
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});

export const registerReviewRoutes = async (
  app: FastifyInstance,
  deps: ReviewRoutesDependencies
) => {
  const review = implement(reviewOrpcContract).$context<OrpcHttpContext>();
  const router = review.router({
    list: review.list.handler(async ({ input, context }) => {
      const result = await deps.reviewHandlers.list({
        organizationId: context.request.authContext.organizationId,
        limit: input.limit,
        cursor: input.cursor,
        timeZone: input.timeZone,
      });

      return result.match(
        (page) => toReviewBody(page),
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
        (page) => page,
        (error) => {
          throw mapListDoneError(error);
        }
      );
    }),
  });

  const handler = new OpenAPIHandler(router, openApiHandlerOptions(listedRequestValidationError));

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', deps.authMiddleware);

    const mount = (url: string) => {
      authedApp.route({
        method: 'GET',
        url,
        handler: async (request, reply) => dispatchOrpc(handler, request, reply),
      });
    };

    mount('/api/review/done');
    mount('/api/review');
  });
};
