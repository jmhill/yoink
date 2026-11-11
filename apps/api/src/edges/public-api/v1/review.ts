import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { reviewOrpcContract } from '@yoink/api-contracts/orpc';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import { openApiHandlerOptions } from '../../_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';
import { listedRequestValidationError } from '../../_shared/request-validation.js';
import type { ReviewHandlers } from '../../../modules/review/index.js';
import { toContractDonePage, toContractReviewPage } from '../../_shared/map-review-document.js';
import { mapListDoneError, mapListReviewError } from './review-errors.js';

export type ReviewEdgeDependencies = { reviewHandlers: ReviewHandlers };

type Procedure<T> = T extends { handler: (fn: infer Fn) => unknown } ? Fn : never;

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
      (page) => toContractReviewPage(page),
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
      (page) => toContractDonePage(page),
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
