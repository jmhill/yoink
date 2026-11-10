import { createORPCClient, ResponseError } from '@orpc/client';
import type { RouterContractClient } from '@orpc/contract';
import { OpenAPILink } from '@orpc/openapi/fetch';
import type { JsonifiedClient } from '@orpc/openapi';
import { adminProtectedContract, adminPublicContract } from '@yoink/api-contracts/admin';

type PublicClient = JsonifiedClient<RouterContractClient<typeof adminPublicContract>>;
export type AdminClient = JsonifiedClient<RouterContractClient<typeof adminProtectedContract>>;

export const YOINK_BUILD_HEADER = 'X-Yoink-Build';

/** Build id from Vite. Vitest leaves the identifier unset, which is `dev`. */
const adminBuildId = (): string =>
  typeof __COMMIT_SHA__ === 'string' && __COMMIT_SHA__.length > 0 ? __COMMIT_SHA__ : 'dev';

/**
 * HTTP status from an OpenAPI link error. Yoink error bodies are not the oRPC
 * envelope, so a non-2xx arrives as a ResponseError.
 */
export const httpStatusOf = (error: unknown): number | undefined => {
  if (error instanceof ResponseError) {
    return error.response.status;
  }
  return undefined;
};

/** Network failures have no HTTP status. A ResponseError is an HTTP response. */
export const isNetworkFailure = (error: unknown): boolean =>
  httpStatusOf(error) === undefined && error instanceof Error;

const parsedJson = (body: string): unknown => {
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed;
  } catch {
    return undefined;
  }
};

export const httpFailureBody = (error: unknown): unknown => {
  if (!(error instanceof ResponseError)) {
    return undefined;
  }
  const body = error.response.body;
  if (typeof body === 'string') {
    return parsedJson(body);
  }
  return body;
};

const fetchWithSession = (url: string, init: RequestInit): Promise<Response> => {
  const headers = new Headers(init.headers);
  if (!headers.has(YOINK_BUILD_HEADER)) {
    headers.set(YOINK_BUILD_HEADER, adminBuildId());
  }
  return globalThis.fetch(url, { ...init, headers, credentials: 'include' });
};

const openApiLink = (contract: typeof adminPublicContract | typeof adminProtectedContract) =>
  new OpenAPILink(contract, {
    fetch: fetchWithSession,
  });

/**
 * Same-origin admin API. Cookie sessions travel with `credentials: 'include'`.
 * Paths are `/admin-api/...`. The session cookie path stays `/`.
 */
export const publicClient: PublicClient = createORPCClient(openApiLink(adminPublicContract));

export const adminClient: AdminClient = createORPCClient(openApiLink(adminProtectedContract));
