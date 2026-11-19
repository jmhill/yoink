import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import Fastify, { LogController } from 'fastify';
import { createFastifyInstance } from './app.js';
import { registerRequestCompletedLog, slowRequestWarning } from './platform/logging/request-log.js';

const capture = () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  return { lines, stream };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const entries = (lines: readonly string[]): Record<string, unknown>[] =>
  lines
    .join('')
    .split('\n')
    .flatMap((line) => {
      if (line.trim().length === 0) {
        return [];
      }
      const parsed: unknown = JSON.parse(line);
      return isRecord(parsed) ? [parsed] : [];
    });

describe('request completed logs', () => {
  it('puts the URL and status code on the completed line', async () => {
    const { lines, stream } = capture();
    const app = Fastify({
      logger: { level: 'info', stream },
      logController: new LogController({ disableRequestLogging: true }),
    });
    registerRequestCompletedLog(app);
    app.get('/api/tasks', async () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/tasks?filter=today' });

    expect(response.statusCode).toBe(200);
    const completed = entries(lines).filter((entry) => entry.msg === 'request completed');
    expect(completed).toEqual([
      expect.objectContaining({
        method: 'GET',
        route: '/api/tasks',
        url: '/api/tasks?filter=today',
        statusCode: 200,
      }),
    ]);
    expect(typeof completed[0]?.responseTime).toBe('number');
    await app.close();
  });

  it('is what the API server writes', async () => {
    const { lines, stream } = capture();
    const app = createFastifyInstance(
      { level: 'info', pretty: false, sentry: { enabled: false, minLevel: 'info' } },
      { stream }
    );
    app.get('/health', async (_request, reply) => {
      reply.status(204);
      return null;
    });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(204);
    const completed = entries(lines).find((entry) => entry.msg === 'request completed');
    expect(completed).toMatchObject({
      method: 'GET',
      route: '/health',
      url: '/health',
      statusCode: 204,
    });
    expect(completed).not.toHaveProperty('tokenId');
    expect(typeof completed?.reqId).toBe('string');
    await app.close();
  });

  it('puts the token id, build, and alias on a token request and leaves them off a session request', async () => {
    const { lines, stream } = capture();
    const app = Fastify({
      logger: { level: 'info', stream },
      logController: new LogController({ disableRequestLogging: true }),
    });
    registerRequestCompletedLog(app);
    app.get('/api/v1/captures', async (request) => {
      request.apiTokenId = '00000000-0000-4000-8000-000000000002';
      request.publicApiAlias = false;
      return { ok: true };
    });
    app.get('/web-api/auth/session', async () => ({ ok: true }));
    await app.ready();

    const tokenResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/captures',
      headers: { 'user-agent': 'YoinkTest/1.0', 'x-yoink-build': 'build-418' },
    });
    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/web-api/auth/session',
    });

    expect(tokenResponse.statusCode).toBe(200);
    expect(sessionResponse.statusCode).toBe(200);
    const completed = entries(lines).filter((entry) => entry.msg === 'request completed');
    expect(completed).toEqual([
      expect.objectContaining({
        method: 'GET',
        url: '/api/v1/captures',
        statusCode: 200,
        userAgent: 'YoinkTest/1.0',
        yoinkBuild: 'build-418',
        alias: false,
        tokenId: '00000000-0000-4000-8000-000000000002',
      }),
      expect.objectContaining({
        method: 'GET',
        url: '/web-api/auth/session',
        statusCode: 200,
      }),
    ]);
    expect(completed[1]).not.toHaveProperty('tokenId');
    expect(completed[1]).not.toHaveProperty('alias');
    expect(completed[1]).not.toHaveProperty('yoinkBuild');
    await app.close();
  });

  it('warns on a slow fixture-server request and stays quiet in Vitest', () => {
    expect(slowRequestWarning({ YOINK_TEST_FIXTURES: 'true' }, 1000)).toBe(true);
    expect(slowRequestWarning({ YOINK_TEST_FIXTURES: 'true' }, 999)).toBe(false);
    expect(slowRequestWarning({ YOINK_TEST_FIXTURES: 'true', VITEST: 'true' }, 5000)).toBe(false);
    expect(slowRequestWarning({}, 5000)).toBe(false);
  });
});
