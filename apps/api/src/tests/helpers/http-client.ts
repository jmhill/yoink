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
    const cookies = (
      response.cookies as CookieData[] | undefined
    ) ?? [];

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

/**
 * Creates an HTTP client that uses fetch for real HTTP requests.
 * Used for E2E testing against a running container.
 */
export const createFetchClient = (baseUrl: string): HttpClient => {
  // Cookie jar to persist cookies across requests (like a browser)
  const cookieJar = new Map<string, string>();

  const buildCookieHeader = (): string | undefined => {
    if (cookieJar.size === 0) return undefined;
    return Array.from(cookieJar.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  };

  const parseSetCookieHeaders = (headers: Headers): CookieData[] => {
    const cookies: CookieData[] = [];
    const setCookieHeaders = headers.getSetCookie();

    for (const header of setCookieHeaders) {
      const parts = header.split(';').map((p) => p.trim());
      const [nameValue] = parts;
      if (!nameValue) continue;

      const [name, ...valueParts] = nameValue.split('=');
      if (!name) continue;

      const value = valueParts.join('=');
      let expires: Date | undefined;

      // Parse expires attribute if present
      for (const part of parts.slice(1)) {
        if (part.toLowerCase().startsWith('expires=')) {
          const expiresStr = part.substring('expires='.length);
          expires = new Date(expiresStr);
        }
      }

      cookies.push({ name, value, expires });

      // Update cookie jar
      if (value === '' || (expires && expires < new Date())) {
        cookieJar.delete(name);
      } else {
        cookieJar.set(name, value);
      }
    }

    return cookies;
  };

  const request = async (options: RequestOptions): Promise<HttpResponse> => {
    const cookieHeader = buildCookieHeader();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    };

    const url = `${baseUrl}${options.url}`;
    const fetchOptions: RequestInit = {
      method: options.method,
      headers,
      body: options.payload ? JSON.stringify(options.payload) : undefined,
    };

    const response = await fetch(url, fetchOptions);
    const body = await response.text();
    const cookies = parseSetCookieHeaders(response.headers);

    // Convert Headers to plain object
    const headersObj: Record<string, string | string[] | undefined> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    return {
      statusCode: response.status,
      body,
      json: <T = unknown>() => JSON.parse(body) as T,
      headers: headersObj,
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
