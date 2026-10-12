import type { FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import { reviewContract, type ReviewCounts, type ReviewProject } from '@yoink/api-contracts';
import type { AuthMiddleware } from '../../access/application/index.js';
import { invalidCursorHttp } from '../../listing/infrastructure/http-listed-page.js';
import type { ListedPage } from '../../listing/domain/listed-page.js';
import { listedRequestValidationError } from '../../shared/infrastructure/request-validation-http.js';
import type { RankedReviewProject } from '../domain/review-order.js';
import type { ReviewHandlers } from '../application/create-review-handlers.js';

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
  const { reviewHandlers, authMiddleware } = deps;
  const s = initServer();

  await app.register(async (authedApp) => {
    authedApp.addHook('preHandler', authMiddleware);

    const reviewRouter = s.router(reviewContract, {
      list: async ({ query, request }) => {
        const result = await reviewHandlers.list({
          organizationId: request.authContext.organizationId,
          limit: query.limit,
          cursor: query.cursor,
          timeZone: query.timeZone,
        });
        return result.match(
          (page) => ({
            status: 200 as const,
            body: toReviewBody(page),
          }),
          (error) => {
            switch (error.type) {
              case 'INVALID_CURSOR':
                return invalidCursorHttp(error);
              case 'STORAGE_ERROR':
                return {
                  status: 500 as const,
                  body: { message: 'Internal server error' },
                };
            }
          }
        );
      },
    });

    s.registerRouter(reviewContract, reviewRouter, authedApp, {
      jsonQuery: true,
      responseValidation: true,
      requestValidationErrorHandler: (err, _request, reply) => {
        return reply.status(400).send(listedRequestValidationError(err));
      },
    });
  });
};
