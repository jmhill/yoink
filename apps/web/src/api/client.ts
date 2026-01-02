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

/**
 * Shared API fetcher that uses session cookies for authentication,
 * with fallback to Bearer token for backwards compatibility.
 * 
 * NOTE: Token fallback is for existing users who haven't migrated to passkeys yet.
 * Remove token handling once all users have registered passkeys.
 * See docs/PLAN.md Phase 7.7c for removal criteria.
 */
const createApi = () => async (args: { path: string; method: string; headers: HeadersInit; body?: BodyInit | null }) => {
  const headers = new Headers(args.headers);
  
  // Backwards compatibility: Include Bearer token if configured
  // The server's combinedAuthMiddleware will prefer session cookies over tokens
  const token = tokenStorage.get();
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
