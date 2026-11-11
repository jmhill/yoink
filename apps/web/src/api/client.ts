import { createORPCClient, ResponseError } from '@orpc/client';
import type { RouterContractClient } from '@orpc/contract';
import { OpenAPILink } from '@orpc/openapi/fetch';
import type { JsonifiedClient } from '@orpc/openapi';
import {
  webAuthContract,
  webHistoryContract,
  webInboxContract,
  webNotesContract,
  webListsContract,
  webProcessContract,
  webProjectsContract,
  webReviewContract,
  webSettingsContract,
  webTasksContract,
  webWorkContract,
} from '@yoink/api-contracts/web';
import {
  authOrpcContract,
  captureOrpcContract,
  organizationOrpcContract,
  processCaptureToProjectOrpcContract,
  projectOrpcContract,
  taskOrpcContract,
} from '@yoink/api-contracts/orpc';
import { headersForApiRequest, withBearerAuthorization } from '@/lib/api-request-headers';
import { tokenStorage } from '@/lib/token';

type CaptureClient = JsonifiedClient<RouterContractClient<typeof captureOrpcContract>>;
type InboxClient = JsonifiedClient<RouterContractClient<typeof webInboxContract>>;
type SettingsClient = JsonifiedClient<RouterContractClient<typeof webSettingsContract>>;
type WebAuthClient = JsonifiedClient<RouterContractClient<typeof webAuthContract>>;

/** Build id from Vite. Vitest leaves the identifier unset, which is `dev`. */
const webBuildId = (): string =>
  typeof __COMMIT_SHA__ === 'string' && __COMMIT_SHA__.length > 0 ? __COMMIT_SHA__ : 'dev';

export const YOINK_BUILD_HEADER = 'X-Yoink-Build';
type ProcessToProjectClient = JsonifiedClient<
  RouterContractClient<typeof processCaptureToProjectOrpcContract>
>;
type TaskClient = JsonifiedClient<RouterContractClient<typeof taskOrpcContract>>;
type WebTaskClient = JsonifiedClient<RouterContractClient<typeof webTasksContract>>;
type ListClient = JsonifiedClient<RouterContractClient<typeof webListsContract>>;
type OrganizationClient = JsonifiedClient<RouterContractClient<typeof organizationOrpcContract>>;
type AuthClient = JsonifiedClient<RouterContractClient<typeof authOrpcContract>>;
type ProjectClient = JsonifiedClient<RouterContractClient<typeof projectOrpcContract>>;
type WebProjectClient = JsonifiedClient<RouterContractClient<typeof webProjectsContract>>;
type WorkClient = JsonifiedClient<RouterContractClient<typeof webWorkContract>>;
type WebHistoryClient = JsonifiedClient<RouterContractClient<typeof webHistoryContract>>;
type WebProcessClient = JsonifiedClient<RouterContractClient<typeof webProcessContract>>;
type ReviewClient = JsonifiedClient<RouterContractClient<typeof webReviewContract>>;
type NoteClient = JsonifiedClient<RouterContractClient<typeof webNotesContract>>;

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
 * Login and session checks must not redirect on 401. The pages handle that.
 */
const fetchKeepingBody = (url: string, init: RequestInit): Promise<Response> => {
  const headers = withBearerAuthorization(
    headersForApiRequest(init.headers ?? {}, init.body),
    tokenStorage.get()
  );
  if (!headers.has(YOINK_BUILD_HEADER)) {
    headers.set(YOINK_BUILD_HEADER, webBuildId());
  }
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
      // oRPC does not read a body it classifies as empty. Chromium then has
      // nothing for Network.getResponseBody, and Playwright's response.text()
      // fails on a 204. The previous client always read the body before the
      // fetch settled. A clone leaves the original stream for the decoder.
      await response.clone().arrayBuffer();
      return response;
    });
};

const fetchWithSession = (url: string, init: RequestInit): Promise<Response> =>
  fetchKeepingBody(url, init).then((response) => {
    if (response.status === 401) {
      redirectToLogin();
    }
    return response;
  });

const fetchForAuth = fetchKeepingBody;

export const captureClient: CaptureClient = createORPCClient(
  new OpenAPILink(captureOrpcContract, { fetch: fetchWithSession })
);

/**
 * OpenAPILink joins the origin pathname with the absolute contract path,
 * so `/web-api` plus `/inbox` is `/web-api/inbox`.
 */
export const inboxClient: InboxClient = createORPCClient(
  new OpenAPILink(webInboxContract, {
    origin: '/web-api',
    fetch: fetchWithSession,
  })
);

/**
 * Settings and organizations. `/web-api` plus `/organizations/switch`
 * is `/web-api/organizations/switch`.
 */
export const settingsClient: SettingsClient = createORPCClient(
  new OpenAPILink(webSettingsContract, {
    origin: '/web-api',
    fetch: fetchWithSession,
  })
);

/**
 * Login, signup, session, passkeys, and join.
 * A 401 stays on the page. Login verify uses 401 for an unknown passkey.
 */
export const authWebClient: WebAuthClient = createORPCClient(
  new OpenAPILink(webAuthContract, {
    origin: '/web-api',
    fetch: fetchForAuth,
  })
);

export const processToProjectClient: ProcessToProjectClient = createORPCClient(
  new OpenAPILink(processCaptureToProjectOrpcContract, { fetch: fetchWithSession })
);

/**
 * Process, trash, and snooze. `/web-api` plus `/captures/{id}/process` is
 * `/web-api/captures/{id}/process`. Inbox list and create stay on
 * `inboxClient`. The Inbox screen keeps `captureClient` until its own move.
 * Public `/api` and `/api/v1` stay on `captureClient`.
 */
export const processClient: WebProcessClient = createORPCClient(
  new OpenAPILink(webProcessContract, {
    origin: '/web-api',
    fetch: fetchWithSession,
  })
);

export const taskClient: TaskClient = createORPCClient(
  new OpenAPILink(taskOrpcContract, { fetch: fetchWithSession })
);

/**
 * Task board create, list, update, complete, uncomplete, and delete.
 * `/web-api` plus `/tasks` is `/web-api/tasks`. Get, pin, and history stay
 * on `taskClient`. Project, work, and review keep task writes on `taskClient`.
 */
export const webTaskClient: WebTaskClient = createORPCClient(
  new OpenAPILink(webTasksContract, {
    origin: '/web-api',
    fetch: fetchWithSession,
  })
);

/**
 * Named lists and open-task order. One client, because the rail and every
 * `['lists']` query share that cache. `/web-api` plus `/lists` is
 * `/web-api/lists`. The `/api` alias stays for other clients.
 */
export const listClient: ListClient = createORPCClient(
  new OpenAPILink(webListsContract, {
    origin: '/web-api',
    fetch: fetchWithSession,
  })
);

export const organizationClient: OrganizationClient = createORPCClient(
  new OpenAPILink(organizationOrpcContract, { fetch: fetchWithSession })
);

export const authClient: AuthClient = createORPCClient(
  new OpenAPILink(authOrpcContract, { fetch: fetchWithSession })
);

/**
 * Project catalog and create. Review, work, process, tasks, and the rail
 * share `['projects']`, so that list stays here. Project history and finished
 * tasks are `webHistoryClient`.
 */
export const projectClient: ProjectClient = createORPCClient(
  new OpenAPILink(projectOrpcContract, { fetch: fetchWithSession })
);

/**
 * Project page and staged import. `/web-api` plus `/projects/{id}` is
 * `/web-api/projects/{id}`. Open-task pages stay in Task Management order.
 * The page splits that page into the next-action section and the other
 * open tasks and adds the count. It does not sort.
 */
/**
 * Project history and finished tasks. `/web-api` plus `/projects/{id}/history`
 * is `/web-api/projects/{id}/history`. Finished tasks use `/finished` so they
 * do not share the open-task route. The edge does not sort those pages.
 * Public `/api` and `/api/v1` stay on `projectClient`.
 */
export const webHistoryClient: WebHistoryClient = createORPCClient(
  new OpenAPILink(webHistoryContract, {
    origin: '/web-api',
    fetch: fetchWithSession,
  })
);

export const webProjectClient: WebProjectClient = createORPCClient(
  new OpenAPILink(webProjectsContract, {
    origin: '/web-api',
    fetch: fetchWithSession,
  })
);

/**
 * Work screen and work lists. `/web-api` plus `/work` is `/web-api/work`.
 * Sections, query totals, and owner labels come from that response.
 * The page does not sort them. Task writes stay on `taskClient`.
 */
export const workClient: WorkClient = createORPCClient(
  new OpenAPILink(webWorkContract, {
    origin: '/web-api',
    fetch: fetchWithSession,
  })
);

/**
 * Review attention and the done week. `/web-api` plus `/review` is
 * `/web-api/review`. The badge shares `['review']` with the Review screen.
 * Each call is one Review query. The page does not sort that page.
 * Public `/api` and `/api/v1` stay on the alias. Project catalog, session,
 * members, and review writes stay on their current clients.
 */
export const reviewClient: ReviewClient = createORPCClient(
  new OpenAPILink(webReviewContract, {
    origin: '/web-api',
    fetch: fetchWithSession,
  })
);

/**
 * Project notes list, get, create, update, and delete. `/web-api` plus
 * `/projects/{projectId}/notes` is `/web-api/projects/{projectId}/notes`.
 * Import and changed stay on `/api` for the notes-mirror bot.
 */
export const noteClient: NoteClient = createORPCClient(
  new OpenAPILink(webNotesContract, {
    origin: '/web-api',
    fetch: fetchWithSession,
  })
);
