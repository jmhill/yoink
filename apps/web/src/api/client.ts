import { initTsrReactQuery } from '@ts-rest/react-query/v5';
import { captureContract, taskContract } from '@yoink/api-contracts';
import { tokenStorage } from '@/lib/token';

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
    body: args.body,
  });

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
