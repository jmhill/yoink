import { ORPCError } from '@orpc/server';

export type ServerFailureLog = {
  readonly error: unknown;
  readonly message: string;
};

/**
 * 500 and health 503 are the failures whose original cause must be logged.
 * Client errors stay quiet.
 */
export const serverFailureLog = (caught: unknown): ServerFailureLog | undefined => {
  if (!(caught instanceof ORPCError)) {
    return undefined;
  }
  switch (caught.code) {
    case 'INTERNAL_SERVER_ERROR':
    case 'SERVICE_UNAVAILABLE':
      return {
        error: caught.cause ?? caught,
        message: caught.message,
      };
    default:
      return undefined;
  }
};
