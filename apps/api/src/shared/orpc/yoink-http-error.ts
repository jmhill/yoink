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

export const yoinkServerError = (message: string, cause: unknown) =>
  new ORPCError('INTERNAL_SERVER_ERROR', {
    message,
    cause,
  });
