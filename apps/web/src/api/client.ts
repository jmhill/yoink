import { initTsrReactQuery } from '@ts-rest/react-query/v5';
import { captureContract, taskContract } from '@yoink/api-contracts';
import { tokenStorage } from '@/lib/token';

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

// Shared API fetcher
const createApi = () => async (args: { path: string; method: string; headers: HeadersInit; body?: BodyInit | null }) => {
  const token = tokenStorage.get();
  const headers = new Headers(args.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(args.path, {
    method: args.method,
    headers,
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
 * Automatically injects Bearer token from localStorage.
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
 * Automatically injects Bearer token from localStorage.
 */
export const tsrTasks = initTsrReactQuery(taskContract, {
  baseUrl: '',
  baseHeaders: {
    'Content-Type': 'application/json',
  },
  api: createApi(),
});
