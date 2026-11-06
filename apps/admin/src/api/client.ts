import { createORPCClient, ResponseError } from '@orpc/client';
import type { RouterContractClient } from '@orpc/contract';
import { OpenAPILink } from '@orpc/openapi/fetch';
import type { JsonifiedClient } from '@orpc/openapi';
import {
  adminProtectedOrpcContract,
  adminPublicOrpcContract,
} from '@yoink/api-contracts/orpc';

type PublicClient = JsonifiedClient<RouterContractClient<typeof adminPublicOrpcContract>>;
export type AdminClient = JsonifiedClient<RouterContractClient<typeof adminProtectedOrpcContract>>;

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

const fetchWithSession = (url: string, init: RequestInit): Promise<Response> =>
  globalThis.fetch(url, { ...init, credentials: 'include' });

const openApiLink = (contract: typeof adminPublicOrpcContract | typeof adminProtectedOrpcContract) =>
  new OpenAPILink(contract, {
    fetch: fetchWithSession,
  });

/**
 * Same-origin admin API. Cookie sessions travel with `credentials: 'include'`.
 * Paths stay `/api/admin/...`.
 */
export const publicClient: PublicClient = createORPCClient(openApiLink(adminPublicOrpcContract));

export const adminClient: AdminClient = createORPCClient(openApiLink(adminProtectedOrpcContract));
