import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { bootstrapApp, createInfrastructure } from '../composition-root.js';
import { createFastifyInstance } from '../app.js';
import { runMigrations } from '../platform/database/migrator.js';
import { migrations } from '../platform/database/migrations.js';
import {
  seedTestUserSession,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
  TEST_TOKEN,
  testConfigWithWebAuthn,
} from './helpers/test-app.js';

const tokenId = TEST_TOKEN.split(':')[0] ?? '';
const secret = TEST_TOKEN.split(':')[1] ?? '';
const sessionCookie = `${TEST_SESSION_COOKIE}=${TEST_SESSION_ID}`;

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

const boot = async () => {
  const { lines, stream } = capture();
  const http = createFastifyInstance(
    { level: 'info', pretty: false, sentry: { enabled: false, minLevel: 'info' } },
    { stream },
  );
  const infrastructure = createInfrastructure(testConfigWithWebAuthn);
  await runMigrations(infrastructure.database, migrations);
  const app = await bootstrapApp({
    config: testConfigWithWebAuthn,
    infrastructure,
    silent: true,
    app: http,
  });
  await seedTestUserSession(infrastructure.database);
  return { app, lines };
};

describe('request caller logs', () => {
  it('records the token id on alias and v1 requests, and not on session requests', async () => {
    const { app, lines } = await boot();
    const tokenHeaders = {
      authorization: `Bearer ${TEST_TOKEN}`,
      'user-agent': 'YoinkTest/1.0',
      'x-yoink-build': 'build-418',
    };

    const versioned = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/tokens',
      headers: tokenHeaders,
    });
    const alias = await app.inject({
      method: 'GET',
      url: '/api/auth/tokens',
      headers: tokenHeaders,
    });
    const sessionAlias = await app.inject({
      method: 'GET',
      url: '/api/captures',
      headers: {
        cookie: sessionCookie,
        'user-agent': 'YoinkWeb/1.0',
        'x-yoink-build': 'web-build',
      },
    });
    const sessionAndToken = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: {
        ...tokenHeaders,
        cookie: sessionCookie,
      },
    });
    const web = await app.inject({
      method: 'GET',
      url: '/web-api/auth/passkey/credentials',
      headers: {
        cookie: sessionCookie,
        'user-agent': 'YoinkWeb/1.0',
        'x-yoink-build': 'web-build',
      },
    });
    const rejected = await app.inject({
      method: 'GET',
      url: '/api/v1/captures',
      headers: {
        authorization: `Bearer ${tokenId}:not-the-real-secret`,
        'user-agent': 'YoinkTest/1.0',
      },
    });

    expect(versioned.statusCode).toBe(200);
    expect(alias.statusCode).toBe(200);
    expect(sessionAlias.statusCode).toBe(200);
    expect(sessionAndToken.statusCode).toBe(200);
    expect(web.statusCode).toBe(200);
    expect(rejected.statusCode).toBe(401);

    const logged = entries(lines);
    const completed = (url: string) =>
      logged.find((entry) => entry.msg === 'request completed' && entry.url === url);
    const publicApi = (url: string) =>
      logged.find((entry) => entry.msg === 'public api request' && entry.url === url);

    const caller = {
      method: 'GET',
      statusCode: 200,
      userAgent: 'YoinkTest/1.0',
      yoinkBuild: 'build-418',
      tokenId,
    };
    expect(completed('/api/v1/auth/tokens')).toMatchObject({ ...caller, alias: false });
    expect(publicApi('/api/v1/auth/tokens')).toMatchObject({
      ...caller,
      apiVersion: 'v1',
      alias: false,
    });
    expect(completed('/api/auth/tokens')).toMatchObject({ ...caller, alias: true });
    expect(publicApi('/api/auth/tokens')).toMatchObject({
      ...caller,
      apiVersion: 'v1',
      alias: true,
    });

    for (const url of ['/api/captures', '/api/projects', '/web-api/auth/passkey/credentials']) {
      expect(completed(url)).not.toHaveProperty('tokenId');
    }
    expect(completed('/api/captures')).toMatchObject({
      method: 'GET',
      statusCode: 200,
      userAgent: 'YoinkWeb/1.0',
      yoinkBuild: 'web-build',
      alias: true,
    });
    expect(publicApi('/api/captures')).toMatchObject({
      apiVersion: 'v1',
      alias: true,
      method: 'GET',
      statusCode: 200,
    });
    expect(publicApi('/api/captures')).not.toHaveProperty('tokenId');
    expect(completed('/api/projects')).toMatchObject({ alias: true, statusCode: 200 });
    expect(publicApi('/api/projects')).not.toHaveProperty('tokenId');
    expect(completed('/web-api/auth/passkey/credentials')).toMatchObject({
      method: 'GET',
      statusCode: 200,
      yoinkBuild: 'web-build',
    });
    expect(completed('/web-api/auth/passkey/credentials')).not.toHaveProperty('alias');
    expect(publicApi('/web-api/auth/passkey/credentials')).toBeUndefined();

    expect(completed('/api/v1/captures')).toMatchObject({ statusCode: 401 });
    expect(completed('/api/v1/captures')).not.toHaveProperty('tokenId');
    expect(publicApi('/api/v1/captures')).toMatchObject({ alias: false, statusCode: 401 });
    expect(publicApi('/api/v1/captures')).not.toHaveProperty('tokenId');

    const text = lines.join('');
    expect(text).not.toContain(secret);
    expect(text).not.toContain(TEST_TOKEN);
    expect(text).not.toContain('not-the-real-secret');
    expect(text).not.toContain('fake-hash:');
    await app.close();
  });
});
