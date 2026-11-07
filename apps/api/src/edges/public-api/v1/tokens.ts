import { oc } from '@orpc/contract';
import { OpenAPIHandler } from '@orpc/openapi/fastify';
import { implement } from '@orpc/server';
import { tokenOrpcContract } from '@yoink/api-contracts/orpc';
import { publicApiV1Contract } from '@yoink/api-contracts/public-api/v1';
import { accessStorageError } from '../../../access/application/access-http-errors.js';
import type { TokenHandlers } from '../../../access/application/create-token-handlers.js';
import type { ListTokensError } from '../../../access/domain/token-errors.js';
import { yoinkOpenApiHandlerOptions } from '../../_shared/orpc/handler-options.js';
import type { OrpcHttpContext } from '../../_shared/orpc/http-context.js';

export type TokenListEdgeDependencies = { tokenHandlers: TokenHandlers };

type Procedure<T> = T extends { handler: (fn: infer Fn) => unknown } ? Fn : never;

const listTokensFailure = (error: ListTokensError) => {
  switch (error.type) {
    case 'TOKEN_STORAGE_ERROR':
      return accessStorageError(error, 'Failed to list tokens');
  }
};

/**
 * `GET /api/auth/tokens` is the frozen integration procedure. Create, delete,
 * mint, and reissue stay on the client-only registrar and are not aliased.
 * M5.13 removes these access imports once access exports the list from index.ts.
 */
export const createTokenListHandlers = (deps: TokenListEdgeDependencies) => {
  const legacyContract = oc.router({ list: tokenOrpcContract.list });
  const legacy = implement(legacyContract).$context<OrpcHttpContext>();
  const v1 = implement(publicApiV1Contract.tokens).$context<OrpcHttpContext>();

  const list: Procedure<typeof legacy.list> = async ({ context }) => {
    const { userId, organizationId, actor } = context.request.authContext;
    const result = await deps.tokenHandlers.list({ actor, userId, organizationId });
    return result.match(
      (page) => page,
      (error) => {
        throw listTokensFailure(error);
      },
    );
  };

  return {
    legacy: new OpenAPIHandler(legacy.router({ list: legacy.list.handler(list) }), yoinkOpenApiHandlerOptions),
    v1: new OpenAPIHandler(v1.router({ list: v1.list.handler(list) }), yoinkOpenApiHandlerOptions),
  };
};
