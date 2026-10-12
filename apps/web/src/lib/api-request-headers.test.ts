import { describe, expect, it } from 'vitest';
import { headersForApiRequest } from './api-request-headers';

describe('headersForApiRequest', () => {
  it('drops Content-Type when the body is missing so Fastify accepts DELETE', () => {
    const headers = headersForApiRequest(
      { 'Content-Type': 'application/json', Accept: 'application/json' },
      undefined
    );

    expect(headers.get('Content-Type')).toBeNull();
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('keeps Content-Type when there is a JSON body', () => {
    const headers = headersForApiRequest(
      { 'Content-Type': 'application/json' },
      JSON.stringify({ taskId: null })
    );

    expect(headers.get('Content-Type')).toBe('application/json');
  });
});
