import { describe, expect, it } from 'vitest';
import { headersForApiRequest, withBearerAuthorization } from './api-request-headers';

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

  it('omits Content-Type for an empty string body without mutating the input', () => {
    const headers = headersForApiRequest(
      { 'Content-Type': 'application/json', Accept: 'application/json' },
      ''
    );

    expect(headers.get('Content-Type')).toBeNull();
    expect(headers.get('Accept')).toBe('application/json');
  });
});

describe('withBearerAuthorization', () => {
  it('builds Authorization without mutating the input headers', () => {
    const input = new Headers({ Accept: 'application/json' });
    const headers = withBearerAuthorization(input, 'secret-token');

    expect(headers.get('Authorization')).toBe('Bearer secret-token');
    expect(headers.get('Accept')).toBe('application/json');
    expect(input.get('Authorization')).toBeNull();
  });

  it('omits Authorization when there is no token', () => {
    const headers = withBearerAuthorization(new Headers({ Accept: 'application/json' }), null);

    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('Accept')).toBe('application/json');
  });
});
