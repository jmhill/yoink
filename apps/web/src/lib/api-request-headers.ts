/**
 * The OpenAPI client sets Content-Type: application/json on requests that
 * carry a JSON body. Fastify rejects an empty body with that header
 * (FST_ERR_CTP_EMPTY_JSON_BODY). Drop Content-Type when there is no body.
 */
export const headersForApiRequest = (
  headers: HeadersInit,
  body?: BodyInit | null
): Headers => {
  if (body !== undefined && body !== null && body !== '') {
    return new Headers(headers);
  }
  return new Headers(
    [...new Headers(headers)].filter(([name]) => name.toLowerCase() !== 'content-type')
  );
};

export const withBearerAuthorization = (
  headers: Headers,
  token: string | null
): Headers =>
  token === null
    ? new Headers(headers)
    : new Headers([...headers, ['Authorization', `Bearer ${token}`]]);
