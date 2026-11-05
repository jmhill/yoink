import { COMMON_ERROR_STATUS_MAP, ORPCError } from '@orpc/server';
import type { StandardHandlerInterceptor } from '@orpc/server/standard';
import type { OrpcHttpContext } from './http-context.js';
import { serverFailureLog } from './server-failure-log.js';
import { yoinkErrorBody } from './yoink-error-body.js';

const logServerFailure = (error: unknown, context: OrpcHttpContext): void => {
  const failure = serverFailureLog(error);
  if (failure) {
    context.request.log.error({ error: failure.error }, failure.message);
    return;
  }
  if (!(error instanceof ORPCError)) {
    context.request.log.error({ error }, 'Internal server error');
  }
};

const serverFailureInterceptor: StandardHandlerInterceptor<OrpcHttpContext> = async (options) => {
  try {
    return await options.next();
  } catch (caught) {
    logServerFailure(caught, options.context);
    if (caught instanceof ORPCError) {
      throw caught;
    }
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: 'Internal server error',
      cause: caught,
    });
  }
};

export const yoinkOpenApiHandlerOptions = {
  errorStatusMap: {
    ...COMMON_ERROR_STATUS_MAP,
    INVALID_CURSOR: 400,
  },
  errorResponseBodyEncoder: yoinkErrorBody,
  interceptors: [serverFailureInterceptor],
};
