export type CookieData = { name: string; value: string; expires?: Date };

export type HttpResponse = {
  statusCode: number;
  body: string;
  json: <T = unknown>() => T;
  headers: Record<string, string | undefined>;
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
 * Creates an HTTP client that uses fetch for real HTTP requests.
 * Automatically persists cookies across requests like a browser.
 */
export const createHttpClient = (baseUrl: string): HttpClient => {
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
    const headersObj: Record<string, string | undefined> = {};
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
