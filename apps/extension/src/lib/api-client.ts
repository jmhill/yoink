import { createORPCClient, ResponseError } from '@orpc/client';
import type { RouterContractClient } from '@orpc/contract';
import { OpenAPILink } from '@orpc/openapi/fetch';
import type { JsonifiedClient } from '@orpc/openapi';
import { extensionApiV1Contract } from '@yoink/api-contracts/extension/v1';
import { storage } from './storage';

/** Chrome manifest version. Sent as `X-Yoink-Extension-Version`. */
export const EXTENSION_VERSION = '1.0.2';

type CaptureClient = JsonifiedClient<RouterContractClient<typeof extensionApiV1Contract>>;

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

/** OpenAPILink joins the origin pathname with an absolute contract path. */
export const extensionApiOrigin = (apiUrl: string): string => {
  const base = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
  return `${base}extension-api/v1`;
};

const captureClient = (apiUrl: string, token: string): CaptureClient => {
  const link = new OpenAPILink(extensionApiV1Contract, {
    origin: extensionApiOrigin(apiUrl),
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'X-Yoink-Extension-Version': EXTENSION_VERSION,
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
 * Calls `POST /extension-api/v1/captures` and `GET /extension-api/v1/captures`.
 */
export function createCaptureApiWithConfig(options: {
  apiUrl: string;
  token: string;
}): CaptureClient {
  return captureClient(options.apiUrl, options.token);
}
