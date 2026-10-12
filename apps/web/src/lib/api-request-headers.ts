/**
 * ts-rest clients set Content-Type: application/json on every request.
 * Fastify rejects an empty body with that header (FST_ERR_CTP_EMPTY_JSON_BODY).
 * Drop the header when there is no body so DELETE / body:null routes work.
 */
export const headersForApiRequest = (
  headers: HeadersInit,
  body?: BodyInit | null
): Headers => {
  const next = new Headers(headers);
  if (body === undefined || body === null || body === '') {
    next.delete('Content-Type');
  }
  return next;
};
