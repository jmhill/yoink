import { createORPCClient, ResponseError } from '@orpc/client';
import type { RouterContractClient } from '@orpc/contract';
import { OpenAPILink } from '@orpc/openapi/fetch';
import type { JsonifiedClient } from '@orpc/openapi';
import {
  authOrpcContract,
  captureOrpcContract,
  listOrpcContract,
  noteOrpcContract,
  organizationOrpcContract,
  processCaptureToProjectOrpcContract,
  projectOrpcContract,
  reviewOrpcContract,
  taskOrpcContract,
  tokenOrpcContract,
  workOrpcContract,
} from '@yoink/api-contracts/orpc';
import { headersForApiRequest, withBearerAuthorization } from '@/lib/api-request-headers';
import { tokenStorage } from '@/lib/token';

type CaptureClient = JsonifiedClient<RouterContractClient<typeof captureOrpcContract>>;
type ProcessToProjectClient = JsonifiedClient<
  RouterContractClient<typeof processCaptureToProjectOrpcContract>
>;
type TaskClient = JsonifiedClient<RouterContractClient<typeof taskOrpcContract>>;
type ListClient = JsonifiedClient<RouterContractClient<typeof listOrpcContract>>;
type TokenClient = JsonifiedClient<RouterContractClient<typeof tokenOrpcContract>>;
type OrganizationClient = JsonifiedClient<RouterContractClient<typeof organizationOrpcContract>>;
type AuthClient = JsonifiedClient<RouterContractClient<typeof authOrpcContract>>;
type ProjectClient = JsonifiedClient<RouterContractClient<typeof projectOrpcContract>>;
type WorkClient = JsonifiedClient<RouterContractClient<typeof workOrpcContract>>;
type ReviewClient = JsonifiedClient<RouterContractClient<typeof reviewOrpcContract>>;
type NoteClient = JsonifiedClient<RouterContractClient<typeof noteOrpcContract>>;

/**
 * Redirect to login page with current path as return URL.
 * Only redirects once per page load to avoid redirect loops.
 */
let isRedirecting = false;
const redirectToLogin = () => {
  if (isRedirecting) return;
  isRedirecting = true;

  const currentPath = window.location.pathname;
  const returnTo =
    currentPath !== '/' && currentPath !== '/login' && currentPath !== '/signup'
      ? `?returnTo=${encodeURIComponent(currentPath)}`
      : '';
  window.location.href = `/login${returnTo}`;
};

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

export const httpFailureMessage = (error: unknown): string | undefined => {
  const body = httpFailureBody(error);
  if (
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'string'
  ) {
    return body.message;
  }
  return undefined;
};

/**
 * Session cookies, with a Bearer token when one is still stored.
 * Content-Type is omitted when there is no body so Fastify does not reject
 * an empty JSON payload.
 */
const fetchWithSession = (url: string, init: RequestInit): Promise<Response> => {
  const headers = withBearerAuthorization(
    headersForApiRequest(init.headers ?? {}, init.body),
    tokenStorage.get()
  );
  return globalThis
    .fetch(url, {
      ...init,
      headers,
      credentials: 'include',
      // The OpenAPI transport sets redirect: 'manual' and rejects
      // opaqueredirect. The previous client followed redirects.
      redirect: 'follow',
    })
    .then(async (response) => {
      if (response.status === 401) {
        redirectToLogin();
      }
      // oRPC does not read a body it classifies as empty. Chromium then has
      // nothing for Network.getResponseBody, and Playwright's response.text()
      // fails on a 204. The previous client always read the body before the
      // fetch settled. A clone leaves the original stream for the decoder.
      await response.clone().arrayBuffer();
      return response;
    });
};

export const captureClient: CaptureClient = createORPCClient(
  new OpenAPILink(captureOrpcContract, { fetch: fetchWithSession })
);

export const processToProjectClient: ProcessToProjectClient = createORPCClient(
  new OpenAPILink(processCaptureToProjectOrpcContract, { fetch: fetchWithSession })
);

export const taskClient: TaskClient = createORPCClient(
  new OpenAPILink(taskOrpcContract, { fetch: fetchWithSession })
);

export const listClient: ListClient = createORPCClient(
  new OpenAPILink(listOrpcContract, { fetch: fetchWithSession })
);

export const tokenClient: TokenClient = createORPCClient(
  new OpenAPILink(tokenOrpcContract, { fetch: fetchWithSession })
);

export const organizationClient: OrganizationClient = createORPCClient(
  new OpenAPILink(organizationOrpcContract, { fetch: fetchWithSession })
);

export const authClient: AuthClient = createORPCClient(
  new OpenAPILink(authOrpcContract, { fetch: fetchWithSession })
);

export const projectClient: ProjectClient = createORPCClient(
  new OpenAPILink(projectOrpcContract, { fetch: fetchWithSession })
);

export const workClient: WorkClient = createORPCClient(
  new OpenAPILink(workOrpcContract, { fetch: fetchWithSession })
);

export const reviewClient: ReviewClient = createORPCClient(
  new OpenAPILink(reviewOrpcContract, { fetch: fetchWithSession })
);

export const noteClient: NoteClient = createORPCClient(
  new OpenAPILink(noteOrpcContract, { fetch: fetchWithSession })
);
