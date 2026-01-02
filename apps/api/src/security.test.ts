import { describe, it, expect, beforeEach } from 'vitest';
import { createInfrastructure, bootstrapApp } from './composition-root.js';
import { runMigrations } from './database/migrator.js';
import { migrations } from './database/migrations.js';
import type { AppConfig, RateLimitConfig } from './config/schema.js';
import type { FastifyInstance } from 'fastify';

const defaultRateLimitConfig: RateLimitConfig = {
  enabled: true,
  globalMax: 100,
  globalTimeWindow: '1 minute',
  adminLoginMax: 5,
  adminLoginTimeWindow: '15 minutes',
  authLoginMax: 10,
  authLoginTimeWindow: '15 minutes',
  signupMax: 5,
  signupTimeWindow: '1 hour',
};

const createTestConfig = (overrides?: Partial<AppConfig>): AppConfig => ({
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
  rateLimit: defaultRateLimitConfig,
  log: { level: 'error', pretty: false },
  cookie: { secure: false, sessionName: 'yoink_session', maxAge: 7 * 24 * 60 * 60 },
  ...overrides,
});

describe('Security Features', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const config = createTestConfig();
    const infrastructure = createInfrastructure(config);
    await runMigrations(infrastructure.database, migrations);
    app = await bootstrapApp({ config, infrastructure, silent: true });
  });

  describe('Rate Limiting on Admin Login', () => {
    it('allows successful login attempts within rate limit', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: 'test-admin-password' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 429 after exceeding rate limit', async () => {
      // Make 6 login attempts (limit is 5 per 15 minutes)
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/admin/login',
          payload: { password: 'wrong-password' },
        });
      }

      // 6th attempt should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: 'wrong-password' },
      });

      expect(response.statusCode).toBe(429);
    });

    it('does not rate limit other endpoints at the same rate', async () => {
      // Health endpoint should have higher limits
      for (let i = 0; i < 10; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/api/health',
        });
        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe('Security Headers', () => {
    it('includes X-Content-Type-Options header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('includes X-Frame-Options header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('includes X-XSS-Protection header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      // Modern helmet sets this to 0 (disabled, CSP is preferred)
      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    it('removes X-Powered-By header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Rate Limiting Configuration', () => {
    it('allows unlimited login attempts when rate limiting is disabled', async () => {
      // Create app with rate limiting disabled
      const config = createTestConfig({
        rateLimit: { ...defaultRateLimitConfig, enabled: false },
      });
      const infrastructure = createInfrastructure(config);
      await runMigrations(infrastructure.database, migrations);
      const appWithNoRateLimit = await bootstrapApp({ config, infrastructure, silent: true });

      // Make more than 5 login attempts - should all work (return 401 for wrong password)
      for (let i = 0; i < 10; i++) {
        const response = await appWithNoRateLimit.inject({
          method: 'POST',
          url: '/api/admin/login',
          payload: { password: 'wrong-password' },
        });
        // Should get 401 (wrong password), not 429 (rate limited)
        expect(response.statusCode).toBe(401);
      }
    });
  });

  describe('Rate Limiting on Auth Login', () => {
    it('allows login attempts within rate limit', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login/options',
        payload: {},
      });

      // Should get 200 (login options returned)
      expect(response.statusCode).toBe(200);
    });

    it('does not rate limit login options endpoint', async () => {
      // Login options is not rate limited - only login verify is
      // This allows the login flow to work properly since it requires 2 requests:
      // 1. POST options (get challenge)
      // 2. POST verify (submit signed challenge)
      // Rate limiting only the verify endpoint prevents brute force while
      // allowing legitimate users to complete the full login flow
      for (let i = 0; i < 15; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/auth/login/options',
          payload: {},
        });
      }

      // Should still get 200 even after many requests
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login/options',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
    });

    it('does not rate limit session endpoint', async () => {
      // Session checks happen frequently during normal app usage
      // They should not count towards the login rate limit
      for (let i = 0; i < 15; i++) {
        await app.inject({
          method: 'GET',
          url: '/api/auth/session',
        });
      }

      // Should still be able to attempt login after many session checks
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login/verify',
        payload: { challenge: 'fake-challenge', credential: {} },
      });

      // Should get 400 (invalid challenge) not 429 (rate limited)
      expect(response.statusCode).toBe(400);
    });

    it('returns 429 after exceeding rate limit on login verify', async () => {
      // Make 11 login verify attempts (limit is 10 per 15 minutes)
      for (let i = 0; i < 10; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/auth/login/verify',
          payload: { challenge: 'fake-challenge', credential: {} },
        });
      }

      // 11th attempt should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login/verify',
        payload: { challenge: 'fake-challenge', credential: {} },
      });

      expect(response.statusCode).toBe(429);
    });
  });

  describe('Rate Limiting on Signup', () => {
    it('allows signup attempts within rate limit', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/signup/options',
        payload: { code: 'TESTCODE', email: 'test@example.com' },
      });

      // Should get 404 (invitation not found), not rate limited
      expect(response.statusCode).toBe(404);
    });

    it('returns 429 after exceeding rate limit on signup options', async () => {
      // Make 6 signup options attempts (limit is 5 per hour)
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/auth/signup/options',
          payload: { code: 'TESTCODE', email: 'test@example.com' },
        });
      }

      // 6th attempt should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/signup/options',
        payload: { code: 'TESTCODE', email: 'test@example.com' },
      });

      expect(response.statusCode).toBe(429);
    });

    it('returns 429 after exceeding rate limit on signup verify', async () => {
      // Make 6 signup verify attempts (limit is 5 per hour)
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/auth/signup/verify',
          payload: {
            code: 'TESTCODE',
            email: 'test@example.com',
            challenge: 'fake-challenge',
            credential: {},
          },
        });
      }

      // 6th attempt should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/signup/verify',
        payload: {
          code: 'TESTCODE',
          email: 'test@example.com',
          challenge: 'fake-challenge',
          credential: {},
        },
      });

      expect(response.statusCode).toBe(429);
    });
  });
});
