import type { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set only after a successful API-token check. Never a secret, raw token, or hash. */
    apiTokenId?: string;
    /** True on the unversioned v1 alias, false on `/api/v1`. Unset on other routes. */
    publicApiAlias?: boolean;
  }
}

export type CallerLogInput = {
  readonly method: string;
  readonly statusCode: number;
  readonly userAgent?: string;
  readonly yoinkBuild?: string;
  readonly alias?: boolean;
  readonly tokenId?: string;
};

export type CallerLogFields = {
  readonly method: string;
  readonly statusCode: number;
  readonly userAgent?: string;
  readonly yoinkBuild?: string;
  readonly alias?: boolean;
  readonly tokenId?: string;
};

const present = (value: string | undefined): string | undefined =>
  value !== undefined && value.length > 0 ? value : undefined;

/** Top-level fields Sentry can query. Omits a token id, build, and user agent when absent. */
export const callerLogFields = (input: CallerLogInput): CallerLogFields => {
  const userAgent = present(input.userAgent);
  const yoinkBuild = present(input.yoinkBuild);
  const tokenId = present(input.tokenId);
  return {
    method: input.method,
    statusCode: input.statusCode,
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(yoinkBuild === undefined ? {} : { yoinkBuild }),
    ...(input.alias === undefined ? {} : { alias: input.alias }),
    ...(tokenId === undefined ? {} : { tokenId }),
  };
};

const headerText = (value: string | string[] | undefined): string | undefined => {
  const text = Array.isArray(value) ? value[0] : value;
  return present(text);
};

export const rememberPublicApiAlias = (request: FastifyRequest, alias: boolean): void => {
  request.publicApiAlias = alias;
};

export const callerLogInputOf = (
  request: FastifyRequest,
  statusCode: number,
): CallerLogInput => ({
  method: request.method,
  statusCode,
  userAgent: headerText(request.headers['user-agent']),
  yoinkBuild: headerText(request.headers['x-yoink-build']),
  alias: request.publicApiAlias,
  tokenId: request.apiTokenId,
});
