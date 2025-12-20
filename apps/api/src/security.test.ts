import { describe, it, expect, beforeEach } from 'vitest';
import { createInfrastructure, bootstrapApp } from './composition-root.js';
import { runMigrations } from './database/migrator.js';
import { migrations } from './database/migrations.js';
import type { AppConfig } from './config/schema.js';
import type { FastifyInstance } from 'fastify';

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
  ...overrides,
});

describe('Security Features', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const config = createTestConfig();
    const infrastructure = createInfrastructure(config);
    runMigrations(infrastructure.database.db, migrations);
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
});
