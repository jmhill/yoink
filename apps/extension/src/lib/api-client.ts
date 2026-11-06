import { createORPCClient, ResponseError } from '@orpc/client';
import type { RouterContractClient } from '@orpc/contract';
import { OpenAPILink } from '@orpc/openapi/fetch';
import type { JsonifiedClient } from '@orpc/openapi';
import { captureOrpcContract } from '@yoink/api-contracts/orpc';
import { storage } from './storage';

type CaptureClient = JsonifiedClient<RouterContractClient<typeof captureOrpcContract>>;

/**
 * HTTP status from an OpenAPI link error. Yoink error bodies are not the oRPC
 * envelope, so a non-2xx arrives as a ResponseError (often MalformedResponseError).
 */
export const httpStatusOf = (error: unknown): number | undefined => {
  if (error instanceof ResponseError) {
    return error.response.status;
  }
  return undefined;
};

const captureClient = (apiUrl: string, token: string): CaptureClient => {
  const link = new OpenAPILink(captureOrpcContract, {
    origin: apiUrl,
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
  return createORPCClient(link);
};

/**
 * Creates an API client with the configured base URL and token.
 * Returns null if the extension is not configured.
 */
export async function createCaptureApi(): Promise<CaptureClient | null> {
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
 * Calls `POST /api/captures` and `GET /api/captures`.
 */
export function createCaptureApiWithConfig(options: {
  apiUrl: string;
  token: string;
}): CaptureClient {
  return captureClient(options.apiUrl, options.token);
}
