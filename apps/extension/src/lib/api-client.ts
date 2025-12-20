import { initClient } from '@ts-rest/core';
import { captureContract } from '@yoink/api-contracts';
import { storage } from './storage';

/**
 * Creates an API client with the configured base URL and token.
 * Returns null if the extension is not configured.
 */
export async function createCaptureApi() {
  const config = await storage.get();

  if (!config.apiUrl || !config.token) {
    return null;
  }

  return createCaptureApiWithConfig({
    apiUrl: config.apiUrl,
    token: config.token,
  });
}

/**
 * Creates an API client with explicit config (for validation).
 */
export function createCaptureApiWithConfig(options: {
  apiUrl: string;
  token: string;
}) {
  const { apiUrl, token } = options;

  return initClient(captureContract, {
    baseUrl: apiUrl,
    baseHeaders: {
      'Content-Type': 'application/json',
    },
    api: async (args) => {
      const headers = new Headers(args.headers);
      headers.set('Authorization', `Bearer ${token}`);

      const response = await fetch(args.path, {
        method: args.method,
        headers,
        body: args.body,
      });

      // Handle empty responses (like 204 No Content)
      const contentType = response.headers.get('content-type');
      let body: unknown;
      if (contentType?.includes('application/json')) {
        body = await response.json();
      } else {
        body = undefined;
      }

      return {
        status: response.status,
        body,
        headers: response.headers,
      };
    },
  });
}
