import { initTsrReactQuery } from '@ts-rest/react-query/v5';
import { captureContract, taskContract } from '@yoink/api-contracts';

/**
 * Redirect to login page with current path as return URL.
 * Only redirects once per page load to avoid redirect loops.
 */
let isRedirecting = false;
const redirectToLogin = () => {
  if (isRedirecting) return;
  isRedirecting = true;

  const currentPath = window.location.pathname;
  const returnTo = currentPath !== '/' && currentPath !== '/login' && currentPath !== '/signup'
    ? `?returnTo=${encodeURIComponent(currentPath)}`
    : '';
  window.location.href = `/login${returnTo}`;
};

/**
 * Shared API fetcher that uses session cookies for authentication.
 * Redirects to login on 401 Unauthorized responses.
 */
const createApi = () => async (args: { path: string; method: string; headers: HeadersInit; body?: BodyInit | null }) => {
  const response = await fetch(args.path, {
    method: args.method,
    headers: args.headers,
    credentials: 'include', // Include session cookies
    body: args.body,
  });

  // Handle 401 Unauthorized - redirect to login
  if (response.status === 401) {
    redirectToLogin();
  }

  // Handle empty responses (204 No Content)
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;

  return {
    status: response.status,
    body,
    headers: response.headers,
  };
};

/**
 * ts-rest React Query client for capture endpoints.
 * Uses session cookies for authentication.
 */
export const tsr = initTsrReactQuery(captureContract, {
  baseUrl: '',
  baseHeaders: {
    'Content-Type': 'application/json',
  },
  api: createApi(),
});

/**
 * ts-rest React Query client for task endpoints.
 * Uses session cookies for authentication.
 */
export const tsrTasks = initTsrReactQuery(taskContract, {
  baseUrl: '',
  baseHeaders: {
    'Content-Type': 'application/json',
  },
  api: createApi(),
});
