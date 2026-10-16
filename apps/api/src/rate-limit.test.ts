import { afterEach, describe, expect, it } from 'vitest';
import { createInfrastructure, bootstrapApp } from './composition-root.js';
import { runMigrations } from './database/migrator.js';
import { migrations } from './database/migrations.js';
import type { AppConfig, RateLimitConfig } from './config/schema.js';
import type { FastifyInstance } from 'fastify';

const tightGlobalLimit: RateLimitConfig = {
  enabled: true,
  globalMax: 3,
  globalTimeWindow: '1 minute',
  adminLoginMax: 5,
  adminLoginTimeWindow: '15 minutes',
  authLoginMax: 10,
  authLoginTimeWindow: '15 minutes',
  signupMax: 5,
  signupTimeWindow: '1 hour',
};

const createTestConfig = (rateLimit: RateLimitConfig): AppConfig => ({
  server: { port: 3000, host: '0.0.0.0' },
  database: { type: 'memory' },
  infrastructure: {
    clock: { type: 'fake' },
    idGenerator: { type: 'sequential' },
    passwordHasher: { type: 'fake' },
  },
  admin: {
    password: 'test-admin-password',
    sessionSecret: 'a-32-character-secret-for-hmac!!',
  },
  webauthn: {
    rpId: 'localhost',
    rpName: 'Test App',
    origin: 'http://localhost:3000',
    challengeSecret: 'a-32-character-secret-for-hmac!!',
  },
  rateLimit,
  log: { level: 'error', pretty: false, sentry: { enabled: false, minLevel: 'info' } },
  sentry: { environment: 'test' },
  cookie: { secure: false, sessionName: 'yoink_session', maxAge: 7 * 24 * 60 * 60 },
});

const startApp = async (rateLimit: RateLimitConfig): Promise<FastifyInstance> => {
  const config = createTestConfig(rateLimit);
  const infrastructure = createInfrastructure(config);
  await runMigrations(infrastructure.database, migrations);
  return bootstrapApp({ config, infrastructure, silent: true });
};

describe('General API rate limit', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('limits unauthenticated clients by the real IP behind Fly', async () => {
    app = await startApp(tightGlobalLimit);

    for (let i = 0; i < 3; i += 1) {
      const allowed = await app.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });
      expect(allowed.statusCode).toBe(200);
    }

    const blocked = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();

    const otherClient = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-forwarded-for': '203.0.113.20' },
    });
    expect(otherClient.statusCode).toBe(200);
  });

  it('prefers Fly-Client-IP when the proxy sends it', async () => {
    app = await startApp(tightGlobalLimit);

    for (let i = 0; i < 3; i += 1) {
      const allowed = await app.inject({
        method: 'GET',
        url: '/api/health',
        headers: {
          'x-forwarded-for': '203.0.113.1',
          'fly-client-ip': '198.51.100.10',
        },
      });
      expect(allowed.statusCode).toBe(200);
    }

    const blocked = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        'x-forwarded-for': '203.0.113.2',
        'fly-client-ip': '198.51.100.10',
      },
    });
    expect(blocked.statusCode).toBe(429);

    const otherFlyClient = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        'x-forwarded-for': '203.0.113.1',
        'fly-client-ip': '198.51.100.20',
      },
    });
    expect(otherFlyClient.statusCode).toBe(200);
  });

  it('keys signed-in sessions and bot tokens separately from IP', async () => {
    app = await startApp(tightGlobalLimit);

    for (let i = 0; i < 3; i += 1) {
      const allowed = await app.inject({
        method: 'GET',
        url: '/api/health',
        headers: {
          'x-forwarded-for': '203.0.113.10',
          authorization: 'Bearer bot-one:secret',
        },
      });
      expect(allowed.statusCode).toBe(200);
    }

    const sameToken = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        'x-forwarded-for': '203.0.113.10',
        authorization: 'Bearer bot-one:secret',
      },
    });
    expect(sameToken.statusCode).toBe(429);

    const otherToken = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        'x-forwarded-for': '203.0.113.10',
        authorization: 'Bearer bot-two:secret',
      },
    });
    expect(otherToken.statusCode).toBe(200);

    const session = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        'x-forwarded-for': '203.0.113.10',
        cookie: 'yoink_session=sess-alice',
      },
    });
    expect(session.statusCode).toBe(200);
  });

  it('does not count sw.js, Workbox, /assets, or index.html against the API budget', async () => {
    app = await startApp(tightGlobalLimit);

    for (let i = 0; i < 3; i += 1) {
      const allowed = await app.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });
      expect(allowed.statusCode).toBe(200);
    }

    const staticPaths = ['/sw.js', '/workbox-a1b2c3.js', '/assets/index-abc.js', '/index.html'];
    for (const url of staticPaths) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });
      expect(response.statusCode, url).not.toBe(429);
    }

    const blocked = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    expect(blocked.statusCode).toBe(429);
  });

  it('keeps the strict admin login limit unchanged', async () => {
    app = await startApp({ ...tightGlobalLimit, globalMax: 100 });

    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: 'wrong-password' },
      });
    }

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'wrong-password' },
    });
    expect(response.statusCode).toBe(429);
  });
});
