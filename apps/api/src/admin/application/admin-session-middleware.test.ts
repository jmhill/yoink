import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import {
  createAdminSessionMiddleware,
  ADMIN_SESSION_COOKIE,
} from './admin-session-middleware.js';
import { createAdminSessionService } from '../domain/admin-session-service.js';
import { createFakeClock } from '@yoink/infrastructure';

describe('adminSessionMiddleware', () => {
  const ADMIN_PASSWORD = 'test-password';
  const SESSION_SECRET = 'a-32-character-secret-for-hmac!!';

  let app: FastifyInstance;
  let validSessionToken: string;

  beforeEach(async () => {
    const clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    const adminSessionService = createAdminSessionService({
      adminPassword: ADMIN_PASSWORD,
      sessionSecret: SESSION_SECRET,
      clock,
    });

    // Create a valid session token
    const loginResult = adminSessionService.login(ADMIN_PASSWORD);
    validSessionToken = loginResult.sessionToken!;

    const adminMiddleware = createAdminSessionMiddleware({ adminSessionService });

    app = Fastify();
    await app.register(cookie);

    app.addHook('preHandler', adminMiddleware);

    app.get('/test', async (request) => {
      return { adminSession: request.adminSession };
    });

    await app.ready();
  });

  it('allows request with valid session cookie', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      cookies: { [ADMIN_SESSION_COOKIE]: validSessionToken },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().adminSession).toEqual({
      isAdmin: true,
      createdAt: '2024-06-15T12:00:00.000Z',
    });
  });

  it('returns 401 when session cookie is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Not authenticated');
  });

  it('returns 401 when session cookie is invalid', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
      cookies: { [ADMIN_SESSION_COOKIE]: 'invalid-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Invalid or expired session');
  });

  it('returns 401 when session cookie is tampered', async () => {
    const [payload] = validSessionToken.split('.');
    const tamperedToken = `${payload}.tampered-signature`;

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      cookies: { [ADMIN_SESSION_COOKIE]: tamperedToken },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Invalid or expired session');
  });
});
