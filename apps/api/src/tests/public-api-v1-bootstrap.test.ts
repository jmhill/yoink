import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { bootstrapApp, createInfrastructure } from '../composition-root.js';
import { v1SuccessorPath } from '../edges/public-api/v1/alias-headers.js';
import { publicApiV1Routes } from '../edges/public-api/v1/routes.js';
import { registerJsonBodyParser } from '../edges/_shared/server/json-body.js';
import { runMigrations } from '../platform/database/migrator.js';
import { migrations } from '../platform/database/migrations.js';
import {
  seedTestUserSession,
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
  TEST_TOKEN,
  testConfigWithWebAuthn,
} from './helpers/test-app.js';

const session = { cookie: `${TEST_SESSION_COOKIE}=${TEST_SESSION_ID}` };
const bearer = { authorization: `Bearer ${TEST_TOKEN}` };
const secret = TEST_TOKEN.split(':')[1] ?? '';

const urlFor = (prefix: '/api' | '/api/v1', path: string) =>
  `${prefix}${path.replace(/:[A-Za-z]+/g, 'x')}`;

const frozenProcedures: { method: string; path: string }[] = [];
for (const route of publicApiV1Routes) {
  const methods = Array.isArray(route.method) ? route.method : [route.method];
  for (const method of methods) frozenProcedures.push({ method, path: route.path });
}

const boot = async () => {
  const infrastructure = createInfrastructure(testConfigWithWebAuthn);
  await runMigrations(infrastructure.database, migrations);
  const app = await bootstrapApp({
    config: testConfigWithWebAuthn,
    infrastructure,
    silent: true,
  });
  await seedTestUserSession(infrastructure.database);
  return app;
};

describe('public API v1 on the bootstrapped app', () => {
  it('mounts all 59 frozen routes at /api/v1 and the alias', async () => {
    expect(frozenProcedures).toHaveLength(59);
    const app = await boot();

    for (const route of frozenProcedures) {
      const alias = await app.inject({ method: route.method, url: urlFor('/api', route.path) });
      expect(alias.statusCode, `${route.method} ${route.path}`).toBe(401);
      expect(alias.headers.link).toBe(
        `<${v1SuccessorPath(urlFor('/api', route.path))}>; rel="successor-version"`,
      );
      expect(alias.headers.deprecation).toBeUndefined();
      expect(alias.headers.sunset).toBeUndefined();

      const versioned = await app.inject({
        method: route.method,
        url: urlFor('/api/v1', route.path),
      });
      expect(versioned.statusCode).toBe(401);
      expect(versioned.json()).toEqual({ message: 'Missing authorization header' });
      expect(versioned.headers.link).toBeUndefined();
      expect(versioned.headers.deprecation).toBeUndefined();
      expect(versioned.headers.sunset).toBeUndefined();
    }
  });

  it('accepts a bearer token on v1 and rejects a session cookie, including token list', async () => {
    const app = await boot();

    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/tokens',
      headers: bearer,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().tokens[0].name).toBeDefined();
    expect(listed.headers.link).toBeUndefined();
    expect(listed.headers.deprecation).toBeUndefined();
    expect(listed.headers.sunset).toBeUndefined();

    const sessionOnV1 = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/tokens',
      headers: session,
    });
    expect(sessionOnV1.statusCode).toBe(401);
    expect(sessionOnV1.json()).toEqual({ message: 'Missing authorization header' });

    const sessionCapture = await app.inject({
      method: 'GET',
      url: '/api/v1/captures',
      headers: session,
    });
    expect(sessionCapture.statusCode).toBe(401);
    expect(sessionCapture.headers.link).toBeUndefined();

    const aliasList = await app.inject({
      method: 'GET',
      url: '/api/auth/tokens',
      headers: session,
    });
    expect(aliasList.statusCode).toBe(200);
    expect(aliasList.headers.link).toBe(
      '</api/v1/auth/tokens>; rel="successor-version"',
    );
    expect(aliasList.headers.deprecation).toBeUndefined();
    expect(aliasList.headers.sunset).toBeUndefined();
  });

  it('keeps health and token writes off the versioned router and off alias headers', async () => {
    const app = await boot();

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(health.headers.link).toBeUndefined();
    expect(health.headers.deprecation).toBeUndefined();
    expect(health.headers.sunset).toBeUndefined();

    const created = await app.inject({
      method: 'POST',
      url: '/api/auth/tokens',
      headers: session,
      payload: { name: 'Lane' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.headers.link).toBeUndefined();
    expect(created.headers.deprecation).toBeUndefined();
    expect(created.headers.sunset).toBeUndefined();

    const versionedCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/tokens',
      headers: bearer,
      payload: { name: 'Lane' },
    });
    expect(versionedCreate.statusCode).toBe(404);

    const versionedDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/auth/tokens/${created.json().token.id}`,
      headers: session,
    });
    expect(versionedDelete.statusCode).toBe(404);
  });

  it('keeps processing a capture twice as HTTP 400 with the inbox message', async () => {
    const app = await boot();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/captures',
      headers: bearer,
      payload: { content: 'Buy milk' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    const processed = await app.inject({
      method: 'POST',
      url: `/api/v1/captures/${id}/process`,
      headers: bearer,
      payload: { type: 'task', data: { title: 'Buy milk' } },
    });
    expect(processed.statusCode).toBe(201);

    const again = await app.inject({
      method: 'POST',
      url: `/api/captures/${id}/process`,
      headers: bearer,
      payload: { type: 'task', data: { title: 'Buy milk' } },
    });
    expect(again.statusCode).toBe(400);
    expect(again.json()).toEqual({ message: 'Capture must be in inbox to be processed' });
    expect(again.headers.link).toBe(
      `</api/v1/captures/${id}/process>; rel="successor-version"`,
    );
    expect(again.headers.deprecation).toBeUndefined();
  });

  it('logs the version and alias without the bearer secret or a human token id', async () => {
    const lines: string[] = [];
    const http = Fastify({
      logger: {
        level: 'info',
        stream: { write: (chunk: string) => lines.push(chunk) },
      },
    });
    registerJsonBodyParser(http);
    const infrastructure = createInfrastructure(testConfigWithWebAuthn);
    await runMigrations(infrastructure.database, migrations);
    const app = await bootstrapApp({
      config: testConfigWithWebAuthn,
      infrastructure,
      silent: true,
      app: http,
    });
    await seedTestUserSession(infrastructure.database);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/tokens',
      headers: bearer,
    });
    expect(response.statusCode).toBe(200);
    const log = lines.join('\n');
    expect(log).toContain('"apiVersion":"v1"');
    expect(log).toContain('"alias":false');
    expect(log).not.toContain(secret);
    expect(log).not.toContain('"tokenId"');
  });
});
