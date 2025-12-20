import type { FastifyInstance } from 'fastify';

export type CookieData = { name: string; value: string; expires?: Date };

export type HttpResponse = {
  statusCode: number;
  body: string;
  json: <T = unknown>() => T;
  headers: Record<string, string | string[] | undefined>;
  cookies: CookieData[];
};

export type RequestOptions = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  payload?: unknown;
};

export type HttpClient = {
  request(options: RequestOptions): Promise<HttpResponse>;
  get(url: string, headers?: Record<string, string>): Promise<HttpResponse>;
  post(
    url: string,
    payload: unknown,
    headers?: Record<string, string>
  ): Promise<HttpResponse>;
  patch(
    url: string,
    payload: unknown,
    headers?: Record<string, string>
  ): Promise<HttpResponse>;
  delete(url: string, headers?: Record<string, string>): Promise<HttpResponse>;
};

/**
 * Creates an HTTP client that wraps Fastify's inject method.
 * Used for in-process testing where we don't need real HTTP.
 * Automatically persists cookies across requests like a browser.
 */
export const createInjectClient = (app: FastifyInstance): HttpClient => {
  // Cookie jar to persist cookies across requests (like a browser)
  const cookieJar = new Map<string, string>();

  const buildCookieHeader = (): string | undefined => {
    if (cookieJar.size === 0) return undefined;
    return Array.from(cookieJar.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  };

  const parseCookies = (cookies: CookieData[]): void => {
    for (const cookie of cookies) {
      if (
        cookie.value === '' ||
        (cookie.expires && cookie.expires < new Date())
      ) {
        // Cookie is being cleared
        cookieJar.delete(cookie.name);
      } else {
        cookieJar.set(cookie.name, cookie.value);
      }
    }
  };

  const request = async (options: RequestOptions): Promise<HttpResponse> => {
    const cookieHeader = buildCookieHeader();
    const headers = {
      ...options.headers,
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    };

    const response = await app.inject({
      method: options.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url: options.url,
      headers,
      payload: options.payload as string | object | Buffer | undefined,
    });

    // Fastify's inject response has a cookies property
    const cookies = (response.cookies as CookieData[] | undefined) ?? [];

    // Persist cookies for subsequent requests
    parseCookies(cookies);

    return {
      statusCode: response.statusCode,
      body: response.body,
      json: <T = unknown>() => response.json() as T,
      headers: response.headers as Record<string, string | string[] | undefined>,
      cookies,
    };
  };

  return {
    request,
    get: (url, headers) => request({ method: 'GET', url, headers }),
    post: (url, payload, headers) =>
      request({ method: 'POST', url, headers, payload }),
    patch: (url, payload, headers) =>
      request({ method: 'PATCH', url, headers, payload }),
    delete: (url, headers) => request({ method: 'DELETE', url, headers }),
  };
};
