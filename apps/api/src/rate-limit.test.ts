import { afterEach, describe, expect, it } from 'vitest';
import { createInfrastructure, bootstrapApp } from './composition-root.js';
import { runMigrations } from './database/migrator.js';
import { migrations } from './database/migrations.js';
import type { AppConfig, RateLimitConfig } from './config/schema.js';
import type { FastifyInstance } from 'fastify';
import type { TokenService } from './access/domain/index.js';
import {
  TEST_SESSION_COOKIE,
  TEST_SESSION_ID,
  TEST_TOKEN,
  TEST_USER_ID,
  TEST_ORG_ID,
} from './tests/helpers/test-app.js';

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

const TEST_TOKEN_SECRET = 'test-token-for-acceptance';

type StartOptions = {
  viaFly?: boolean;
  seedToken?: boolean;
  webauthn?: boolean;
  wrapTokenService?: (tokenService: TokenService) => TokenService;
};

const createTestConfig = (
  rateLimit: RateLimitConfig,
  options: StartOptions
): AppConfig => ({
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
  ...(options.webauthn
    ? {
        webauthn: {
          rpId: 'localhost',
          rpName: 'Test App',
          origin: 'http://localhost:3000',
          challengeSecret: 'a-32-character-secret-for-hmac!!',
        },
      }
    : {}),
  ...(options.seedToken ? { seedToken: TEST_TOKEN_SECRET } : {}),
  rateLimit,
  log: { level: 'error', pretty: false, sentry: { enabled: false, minLevel: 'info' } },
  sentry: { environment: 'test' },
  cookie: { secure: false, sessionName: 'yoink_session', maxAge: 7 * 24 * 60 * 60 },
});

const seedTestUserSession = async (database: {
  execute: (query: { sql: string; args?: unknown[] }) => Promise<unknown>;
}) => {
  await database.execute({
    sql: `INSERT INTO user_sessions (id, user_id, current_organization_id, created_at, expires_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      TEST_SESSION_ID,
      TEST_USER_ID,
      TEST_ORG_ID,
      '2025-01-15T10:00:00.000Z',
      '2026-12-31T00:00:00.000Z',
      '2025-01-15T10:00:00.000Z',
    ],
  });
};

const startApp = async (
  rateLimit: RateLimitConfig,
  options: StartOptions = {}
): Promise<FastifyInstance> => {
  const config = createTestConfig(rateLimit, options);
  const infrastructure = createInfrastructure(config);
  await runMigrations(infrastructure.database, migrations);
  const app = await bootstrapApp({
    config,
    infrastructure,
    silent: true,
    viaFly: options.viaFly ?? false,
    wrapTokenService: options.wrapTokenService,
  });
  if (options.webauthn) {
    await seedTestUserSession(infrastructure.database);
  }
  return app;
};

const health = (app: FastifyInstance, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'GET',
    url: '/api/health',
    headers,
  });

const projects = (app: FastifyInstance, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'GET',
    url: '/api/projects',
    headers,
  });

describe('General API rate limit', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('puts forged X-Forwarded-For and Fly-Client-IP in one bucket', async () => {
    app = await startApp(tightGlobalLimit);

    expect(
      (await health(app, { 'x-forwarded-for': '203.0.113.10' })).statusCode
    ).toBe(200);
    expect(
      (await health(app, { 'x-forwarded-for': '203.0.113.20' })).statusCode
    ).toBe(200);
    expect(
      (
        await health(app, {
          'x-forwarded-for': '203.0.113.30',
          'fly-client-ip': '198.51.100.10',
        })
      ).statusCode
    ).toBe(200);

    const blocked = await health(app, {
      'x-forwarded-for': '203.0.113.40',
      'fly-client-ip': '198.51.100.20',
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('uses Fly-Client-IP only when the process is running on Fly', async () => {
    app = await startApp(tightGlobalLimit, { viaFly: true });

    for (let i = 0; i < 3; i += 1) {
      const allowed = await health(app, {
        'x-forwarded-for': `203.0.113.${i + 1}`,
        'fly-client-ip': '198.51.100.10',
      });
      expect(allowed.statusCode).toBe(200);
    }

    const blocked = await health(app, {
      'x-forwarded-for': '203.0.113.9',
      'fly-client-ip': '198.51.100.10',
    });
    expect(blocked.statusCode).toBe(429);

    const otherFlyClient = await health(app, {
      'x-forwarded-for': '203.0.113.1',
      'fly-client-ip': '198.51.100.20',
    });
    expect(otherFlyClient.statusCode).toBe(200);
  });

  it('puts random cookies and bearer strings in one IP bucket', async () => {
    app = await startApp(tightGlobalLimit);

    expect(
      (
        await health(app, {
          authorization: 'Bearer forged-one:secret-one',
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await health(app, {
          authorization: 'Bearer forged-two:secret-two',
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await health(app, {
          cookie: `${TEST_SESSION_COOKIE}=random-session-secret`,
        })
      ).statusCode
    ).toBe(200);

    const blocked = await health(app, {
      authorization: 'Bearer forged-three:secret-three',
      cookie: `${TEST_SESSION_COOKIE}=another-random-secret`,
    });
    expect(blocked.statusCode).toBe(429);
  });

  it('does not call validateToken for forged tokens once the IP bucket is full', async () => {
    let validateCalls = 0;
    app = await startApp(tightGlobalLimit, {
      wrapTokenService: (tokenService) => ({
        validateToken: (query) => {
          validateCalls += 1;
          return tokenService.validateToken(query);
        },
      }),
    });

    for (let i = 0; i < 3; i += 1) {
      expect((await health(app)).statusCode).toBe(200);
    }

    const blocked = await projects(app, {
      authorization: 'Bearer forged-id:forged-secret',
    });
    expect(blocked.statusCode).toBe(429);
    expect(validateCalls).toBe(0);
  });

  it('validates a real token once per request after the IP check passes', async () => {
    let validateCalls = 0;
    app = await startApp(
      { ...tightGlobalLimit, globalMax: 100 },
      {
        seedToken: true,
        wrapTokenService: (tokenService) => ({
          validateToken: (query) => {
            validateCalls += 1;
            return tokenService.validateToken(query);
          },
        }),
      }
    );

    const first = await projects(app, {
      authorization: `Bearer ${TEST_TOKEN}`,
    });
    expect(first.statusCode).toBe(200);
    expect(validateCalls).toBe(1);

    const second = await projects(app, {
      authorization: `Bearer ${TEST_TOKEN}`,
    });
    expect(second.statusCode).toBe(200);
    expect(validateCalls).toBe(2);
  });

  it('limits a validated user after auth, including across Fly client IPs', async () => {
    app = await startApp(tightGlobalLimit, {
      seedToken: true,
      webauthn: true,
      viaFly: true,
    });

    for (let i = 0; i < 3; i += 1) {
      const allowed = await projects(app, {
        authorization: `Bearer ${TEST_TOKEN}`,
        'fly-client-ip': '198.51.100.10',
      });
      expect(allowed.statusCode).toBe(200);
    }

    const sameIp = await projects(app, {
      authorization: `Bearer ${TEST_TOKEN}`,
      'fly-client-ip': '198.51.100.10',
    });
    expect(sameIp.statusCode).toBe(429);

    const otherIpSameUser = await projects(app, {
      authorization: `Bearer ${TEST_TOKEN}`,
      'fly-client-ip': '198.51.100.20',
    });
    expect(otherIpSameUser.statusCode).toBe(429);

    const sameUserSession = await projects(app, {
      cookie: `${TEST_SESSION_COOKIE}=${TEST_SESSION_ID}`,
      'fly-client-ip': '198.51.100.20',
    });
    expect(sameUserSession.statusCode).toBe(429);
  });

  it('does not count sw.js, Workbox, /assets, or index.html against the API budget', async () => {
    app = await startApp(tightGlobalLimit);

    for (let i = 0; i < 3; i += 1) {
      const allowed = await health(app);
      expect(allowed.statusCode).toBe(200);
    }

    const staticPaths = ['/sw.js', '/workbox-a1b2c3.js', '/assets/index-abc.js', '/index.html'];
    for (const url of staticPaths) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).not.toBe(429);
    }

    expect((await health(app)).statusCode).toBe(429);
  });

  it('keeps the strict admin login limit on the derived IP, not X-Forwarded-For', async () => {
    app = await startApp({ ...tightGlobalLimit, globalMax: 100 });

    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        headers: { 'x-forwarded-for': `203.0.113.${i + 1}` },
        payload: { password: 'wrong-password' },
      });
    }

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      headers: {
        'x-forwarded-for': '203.0.113.99',
        'fly-client-ip': '198.51.100.10',
      },
      payload: { password: 'wrong-password' },
    });
    expect(response.statusCode).toBe(429);
  });
});
