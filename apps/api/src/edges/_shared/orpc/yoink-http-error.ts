import { ORPCError } from '@orpc/server';

type YoinkHttpCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_SERVER_ERROR';

/**
 * Adapter-only. Domain stays a Result. `bodyCode` is the closed error name
 * clients already read from `{ message, code? }`.
 */
export const yoinkHttpError = (failure: {
  readonly code: YoinkHttpCode;
  readonly message: string;
  readonly bodyCode?: string;
  readonly cause?: unknown;
}) => {
  if (failure.bodyCode === undefined) {
    return new ORPCError(failure.code, {
      message: failure.message,
      cause: failure.cause,
    });
  }
  return new ORPCError(failure.code, {
    message: failure.message,
    data: { code: failure.bodyCode },
    cause: failure.cause,
  });
};

export const yoinkServerError = (
  message: string,
  cause: unknown,
  bodyCode?: string
) => {
  if (bodyCode === undefined) {
    return new ORPCError('INTERNAL_SERVER_ERROR', {
      message,
      cause,
    });
  }
  return new ORPCError('INTERNAL_SERVER_ERROR', {
    message,
    cause,
    data: { code: bodyCode },
  });
};

/**
 * 500 whose JSON body keeps `message` (and optional `code`) instead of the
 * generic "Internal server error". `message` is the log line. `bodyMessage`
 * is what the client reads. The interceptor logs `cause`.
 */
export const yoinkPublicServerError = (failure: {
  readonly message: string;
  readonly bodyMessage?: string;
  readonly bodyCode?: string;
  readonly cause?: unknown;
}) => {
  const data: { readonly publicMessage: string; readonly code?: string } =
    failure.bodyCode === undefined
      ? { publicMessage: failure.bodyMessage ?? failure.message }
      : { publicMessage: failure.bodyMessage ?? failure.message, code: failure.bodyCode };
  return new ORPCError('INTERNAL_SERVER_ERROR', {
    message: failure.message,
    cause: failure.cause,
    data,
  });
};
