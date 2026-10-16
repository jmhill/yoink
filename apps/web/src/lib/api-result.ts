export type ApiResult = {
  status: number;
  body: unknown;
  headers: Headers;
};

export type JsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false };

/**
 * Parse a response body without throwing. Empty text is a successful empty body.
 */
export const jsonBodyOf = (text: string): JsonBodyResult => {
  if (text.length === 0) {
    return { ok: true, body: undefined };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
};

/**
 * ts-rest throws this object on non-2xx. Headers must stay on the result
 * so live queries can read Retry-After from a 429.
 */
export const apiResultFromResponse = async (response: Response): Promise<ApiResult> => {
  const parsed = jsonBodyOf(await response.text());
  return {
    status: response.status,
    body: parsed.ok ? parsed.body : undefined,
    headers: response.headers,
  };
};
