import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import type { ReviewCounts, ReviewProject } from '@yoink/api-contracts';
import { reviewOrpcContract } from '@yoink/api-contracts/orpc';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import type { ListedPage } from '../../../kernel/listing/domain/listed-page.js';
import { openApiHandlerOptions } from '../../_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
import { listedRequestValidationError } from '../../_shared/request-validation.js';
import type { RankedReviewProject, ReviewHandlers } from '../../../modules/review/index.js';
import { mapListDoneError, mapListReviewError } from './review-errors.js';

export type ReviewEdgeDependencies = { reviewHandlers: ReviewHandlers };

type Procedure<T> = T extends { handler: (fn: infer Fn) => unknown } ? Fn : never;

const toReviewBody = (
  page: ListedPage<RankedReviewProject> & { today: string; counts: ReviewCounts },
) => ({
  projects: page.items.map(
    (item): ReviewProject => ({
      project: item.project,
      reasons: item.reasons,
      lastChangeAt: item.lastChangeAt,
      daysSinceChange: item.daysSinceChange,
      daysWaiting: item.daysWaiting,
      nextAction: item.nextAction,
    }),
  ),
  today: page.today,
  counts: page.counts,
  hasMore: page.hasMore,
  nextCursor: page.nextCursor,
  total: page.total,
});

export const createReviewHandlers = (deps: ReviewEdgeDependencies) => {
  const legacy = implement(reviewOrpcContract).$context<OrpcHttpContext>();
  const v1 = implement(publicApiV1Contract.review).$context<OrpcHttpContext>();

  const list: Procedure<typeof legacy.list> = async ({ input, context }) => {
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
      },
    );
  };
  const done: Procedure<typeof legacy.done> = async ({ input, context }) => {
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
      },
    );
  };

  const options = openApiHandlerOptions(listedRequestValidationError);
  const legacyRouter = legacy.router({
    list: legacy.list.handler(list),
    done: legacy.done.handler(done),
  });
  const v1Router = v1.router({
    list: v1.list.handler(list),
    done: v1.done.handler(done),
  });
  return {
    legacy: new OpenAPIHandler(legacyRouter, options),
    v1: new OpenAPIHandler(v1Router, options),
  };
};
