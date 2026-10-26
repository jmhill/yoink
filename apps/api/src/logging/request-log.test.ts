import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { createFastifyInstance } from '../app.js';
import { registerRequestCompletedLog } from './request-log.js';

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
      disableRequestLogging: true,
    });
    registerRequestCompletedLog(app);
    app.get('/api/tasks', async () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/tasks?filter=today' });

    expect(response.statusCode).toBe(200);
    const completed = entries(lines).filter((entry) => entry.msg === 'request completed');
    expect(completed).toEqual([
      expect.objectContaining({
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
    expect(completed).toMatchObject({ url: '/health', statusCode: 204 });
    await app.close();
  });
});
