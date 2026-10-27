import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { decideJsonBody, registerJsonBodyParser } from './json-body.js';

describe('decideJsonBody', () => {
  it('treats a DELETE with an empty body and no length headers as no body', () => {
    expect(
      decideJsonBody({
        method: 'DELETE',
        body: '',
        contentLength: undefined,
        transferEncoding: undefined,
      })
    ).toEqual({ kind: 'absent' });
  });

  it('parses a DELETE that declares Content-Length, including 0', () => {
    expect(
      decideJsonBody({
        method: 'DELETE',
        body: '',
        contentLength: '0',
        transferEncoding: undefined,
      })
    ).toEqual({ kind: 'parse' });
  });

  it('parses a DELETE that declares Transfer-Encoding', () => {
    expect(
      decideJsonBody({
        method: 'DELETE',
        body: '',
        contentLength: undefined,
        transferEncoding: 'chunked',
      })
    ).toEqual({ kind: 'parse' });
  });

  it('parses a non-empty DELETE body', () => {
    expect(
      decideJsonBody({
        method: 'DELETE',
        body: '{',
        contentLength: undefined,
        transferEncoding: undefined,
      })
    ).toEqual({ kind: 'parse' });
  });

  it('parses an empty POST body', () => {
    expect(
      decideJsonBody({
        method: 'POST',
        body: '',
        contentLength: undefined,
        transferEncoding: undefined,
      })
    ).toEqual({ kind: 'parse' });
  });
});

describe('registerJsonBodyParser', () => {
  const build = async (bodyLimit?: number) => {
    const app = Fastify({ logger: false, ...(bodyLimit === undefined ? {} : { bodyLimit }) });
    registerJsonBodyParser(app);
    app.delete('/', async (request) => ({
      body: request.body === undefined ? 'undefined' : request.body,
    }));
    app.post('/', async (request) => ({
      body: request.body === undefined ? 'undefined' : request.body,
    }));
    await app.ready();
    return app;
  };

  it('accepts a JSON DELETE with an empty body and no Content-Length', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'DELETE',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ body: 'undefined' });
    await app.close();
  });

  it('accepts a JSON DELETE whose type includes a charset and whose body is empty', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'DELETE',
      url: '/',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      payload: '',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ body: 'undefined' });
    await app.close();
  });

  it('rejects a JSON DELETE that declares Content-Length 0', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'DELETE',
      url: '/',
      headers: { 'content-type': 'application/json', 'content-length': '0' },
      payload: '',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'FST_ERR_CTP_EMPTY_JSON_BODY' });
    await app.close();
  });

  it('rejects malformed JSON', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'DELETE',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'FST_ERR_CTP_INVALID_JSON_BODY' });
    await app.close();
  });

  it('rejects an empty JSON POST', async () => {
    const app = await build();
    const response = await app.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'FST_ERR_CTP_EMPTY_JSON_BODY' });
    await app.close();
  });

  it('keeps the server body limit', async () => {
    const app = await build(8);
    const response = await app.inject({
      method: 'POST',
      url: '/',
      headers: { 'content-type': 'application/json' },
      payload: '{"x":"12345678"}',
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ code: 'FST_ERR_CTP_BODY_TOO_LARGE' });
    await app.close();
  });
});
