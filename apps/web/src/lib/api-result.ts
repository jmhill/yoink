export type ApiResult = {
  status: number;
  body: unknown;
  headers: Headers;
};

/**
 * ts-rest throws this object on non-2xx. Headers must stay on the result
 * so live queries can read Retry-After from a 429.
 */
export const apiResultFromResponse = async (response: Response): Promise<ApiResult> => {
  const text = await response.text();
  const body = text.length === 0 ? undefined : JSON.parse(text);
  return {
    status: response.status,
    body,
    headers: response.headers,
  };
};
