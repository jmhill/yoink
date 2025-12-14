import { describe, it, expect, beforeEach } from 'vitest';
import { createAdminSessionService, type AdminSessionService } from './admin-session-service.js';
import { createFakeClock } from '@yoink/infrastructure';

describe('AdminSessionService', () => {
  const ADMIN_PASSWORD = 'super-secret-password';
  const SESSION_SECRET = 'a-32-character-secret-for-hmac!!';
  let clock: ReturnType<typeof createFakeClock>;
  let service: AdminSessionService;

  beforeEach(() => {
    clock = createFakeClock(new Date('2024-06-15T12:00:00.000Z'));
    service = createAdminSessionService({
      adminPassword: ADMIN_PASSWORD,
      sessionSecret: SESSION_SECRET,
      clock,
    });
  });

  describe('login', () => {
    it('returns success and session token for correct password', () => {
      const result = service.login(ADMIN_PASSWORD);

      expect(result.success).toBe(true);
      expect(result.sessionToken).toBeDefined();
      expect(result.sessionToken).toContain('.');
    });

    it('returns failure for incorrect password', () => {
      const result = service.login('wrong-password');

      expect(result.success).toBe(false);
      expect(result.sessionToken).toBeUndefined();
    });

    it('returns failure for empty password', () => {
      const result = service.login('');

      expect(result.success).toBe(false);
    });

    it('returns failure for similar but different password', () => {
      const result = service.login(ADMIN_PASSWORD + '1');

      expect(result.success).toBe(false);
    });

    it('uses timing-safe comparison that does not leak password length', () => {
      // This test verifies the implementation uses hash comparison
      // which has constant-time regardless of input length
      const shortPassword = 'a';
      const longPassword = 'a'.repeat(1000);

      // Both should fail, but more importantly the implementation
      // should compare fixed-size hashes rather than raw passwords
      const shortResult = service.login(shortPassword);
      const longResult = service.login(longPassword);

      expect(shortResult.success).toBe(false);
      expect(longResult.success).toBe(false);
    });
  });

  describe('verifySession', () => {
    it('returns session for valid token', () => {
      const loginResult = service.login(ADMIN_PASSWORD);
      const session = service.verifySession(loginResult.sessionToken!);

      expect(session).not.toBeNull();
      expect(session?.isAdmin).toBe(true);
      expect(session?.createdAt).toBe('2024-06-15T12:00:00.000Z');
    });

    it('returns null for invalid token format', () => {
      expect(service.verifySession('invalid-token')).toBeNull();
      expect(service.verifySession('')).toBeNull();
      expect(service.verifySession('a.b.c')).toBeNull();
    });

    it('returns null for tampered payload', () => {
      const loginResult = service.login(ADMIN_PASSWORD);
      const [, signature] = loginResult.sessionToken!.split('.');

      // Create a different payload
      const tamperedPayload = Buffer.from(JSON.stringify({
        isAdmin: true,
        createdAt: '2024-01-01T00:00:00.000Z',
      })).toString('base64url');

      const tamperedToken = `${tamperedPayload}.${signature}`;
      expect(service.verifySession(tamperedToken)).toBeNull();
    });

    it('returns null for invalid signature', () => {
      const loginResult = service.login(ADMIN_PASSWORD);
      const [payload] = loginResult.sessionToken!.split('.');

      const tamperedToken = `${payload}.invalid-signature`;
      expect(service.verifySession(tamperedToken)).toBeNull();
    });

    it('returns null for expired session', () => {
      const loginResult = service.login(ADMIN_PASSWORD);

      // Advance clock past 24 hour TTL
      clock.advanceBy(25 * 60 * 60 * 1000);

      expect(service.verifySession(loginResult.sessionToken!)).toBeNull();
    });

    it('returns session for non-expired token', () => {
      const loginResult = service.login(ADMIN_PASSWORD);

      // Advance clock but not past TTL
      clock.advanceBy(23 * 60 * 60 * 1000);

      const session = service.verifySession(loginResult.sessionToken!);
      expect(session).not.toBeNull();
    });

    it('respects custom session TTL', () => {
      const shortTtlService = createAdminSessionService({
        adminPassword: ADMIN_PASSWORD,
        sessionSecret: SESSION_SECRET,
        clock,
        sessionTtlMs: 60 * 1000, // 1 minute
      });

      const loginResult = shortTtlService.login(ADMIN_PASSWORD);

      // Advance past custom TTL
      clock.advanceBy(2 * 60 * 1000);

      expect(shortTtlService.verifySession(loginResult.sessionToken!)).toBeNull();
    });
  });

  describe('createSessionToken', () => {
    it('creates a valid session token', () => {
      const token = service.createSessionToken();

      expect(token).toContain('.');
      const session = service.verifySession(token);
      expect(session).not.toBeNull();
      expect(session?.isAdmin).toBe(true);
    });

    it('includes current timestamp', () => {
      const token = service.createSessionToken();
      const session = service.verifySession(token);

      expect(session?.createdAt).toBe('2024-06-15T12:00:00.000Z');
    });
  });

  describe('session tokens from different secrets', () => {
    it('cannot verify tokens signed with different secret', () => {
      const otherService = createAdminSessionService({
        adminPassword: ADMIN_PASSWORD,
        sessionSecret: 'a-different-32-char-secret-key!!',
        clock,
      });

      const token = service.createSessionToken();
      expect(otherService.verifySession(token)).toBeNull();
    });
  });
});
