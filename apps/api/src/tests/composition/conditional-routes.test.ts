import { describe, it, expect } from 'vitest';
import {
  createTestApp,
  createTestAppWithAdmin,
  createTestAppWithWebAuthn,
  TEST_ADMIN_PASSWORD,
} from '../helpers/test-app.js';

describe('Conditional Route Registration', () => {
  describe('Admin routes', () => {
    it('registers /api/admin/* when admin config provided', async () => {
      const app = await createTestAppWithAdmin();

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: TEST_ADMIN_PASSWORD },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 404 for /api/admin/* when admin config missing', async () => {
      const app = await createTestApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/login',
        payload: { password: TEST_ADMIN_PASSWORD },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('WebAuthn-gated routes', () => {
    it('registers /api/auth/signup/* when WebAuthn config provided', async () => {
      const app = await createTestAppWithWebAuthn();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/signup/options',
        payload: {},
      });

      // Registered: anything but 404 (invalid payload → 400)
      expect(response.statusCode).not.toBe(404);
    });

    it('registers /api/auth/login/* when WebAuthn config provided', async () => {
      const app = await createTestAppWithWebAuthn();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login/options',
        payload: {},
      });

      expect(response.statusCode).not.toBe(404);
    });

    it('returns 404 for WebAuthn routes when WebAuthn config missing', async () => {
      const app = await createTestApp();

      const signup = await app.inject({
        method: 'POST',
        url: '/api/auth/signup/options',
        payload: {},
      });
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login/options',
        payload: {},
      });

      expect(signup.statusCode).toBe(404);
      expect(login.statusCode).toBe(404);
    });
  });

  describe('Core routes always registered', () => {
    it('registers /api/health with 200', async () => {
      const app = await createTestApp();

      const response = await app.inject({ method: 'GET', url: '/api/health' });

      expect(response.statusCode).toBe(200);
    });

    it('registers /api/captures with 401 (not 404) when unauthenticated', async () => {
      const app = await createTestApp();

      const response = await app.inject({
        method: 'GET',
        url: '/api/captures',
      });

      expect(response.statusCode).toBe(401);
    });

    it('registers /api/tasks with 401 (not 404) when unauthenticated', async () => {
      const app = await createTestApp();

      const response = await app.inject({ method: 'GET', url: '/api/tasks' });

      expect(response.statusCode).toBe(401);
    });

    it('registers /api/lists with 401 (not 404) when unauthenticated', async () => {
      const app = await createTestApp();

      const response = await app.inject({ method: 'GET', url: '/api/lists' });

      expect(response.statusCode).toBe(401);
    });

    it('registers POST /api/lists with 401 (not 404) when unauthenticated', async () => {
      const app = await createTestApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/lists',
        payload: { name: 'Groceries' },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
