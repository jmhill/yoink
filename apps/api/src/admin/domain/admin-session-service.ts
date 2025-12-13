import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Clock } from '@yoink/infrastructure';

export type AdminSessionServiceDependencies = {
  adminPassword: string;
  sessionSecret: string;
  clock: Clock;
  sessionTtlMs?: number; // Default 24 hours
};

export type AdminSession = {
  isAdmin: true;
  createdAt: string;
};

export type AdminSessionService = {
  login(password: string): { success: boolean; sessionToken?: string };
  verifySession(sessionToken: string): AdminSession | null;
  createSessionToken(): string;
};

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const createAdminSessionService = (
  deps: AdminSessionServiceDependencies
): AdminSessionService => {
  const { adminPassword, sessionSecret, clock, sessionTtlMs = DEFAULT_SESSION_TTL_MS } = deps;

  const sign = (payload: string): string => {
    const hmac = createHmac('sha256', sessionSecret);
    hmac.update(payload);
    return hmac.digest('base64url');
  };

  const verifySignature = (payload: string, signature: string): boolean => {
    const expectedSignature = sign(payload);
    try {
      return timingSafeEqual(
        Buffer.from(signature, 'base64url'),
        Buffer.from(expectedSignature, 'base64url')
      );
    } catch {
      return false;
    }
  };

  return {
    login(password: string) {
      // Use timing-safe comparison for password
      const isValid =
        password.length === adminPassword.length &&
        timingSafeEqual(Buffer.from(password), Buffer.from(adminPassword));

      if (!isValid) {
        return { success: false };
      }

      const sessionToken = this.createSessionToken();
      return { success: true, sessionToken };
    },

    verifySession(sessionToken: string) {
      // Token format: base64url(payload).signature
      const parts = sessionToken.split('.');
      if (parts.length !== 2) {
        return null;
      }

      const [payloadB64, signature] = parts;

      // Verify signature
      if (!verifySignature(payloadB64, signature)) {
        return null;
      }

      // Decode payload
      let payload: string;
      try {
        payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
      } catch {
        return null;
      }

      // Parse session data
      let session: AdminSession;
      try {
        session = JSON.parse(payload);
      } catch {
        return null;
      }

      // Validate session structure
      if (session.isAdmin !== true || typeof session.createdAt !== 'string') {
        return null;
      }

      // Check session expiry
      const createdAt = new Date(session.createdAt).getTime();
      const now = clock.now().getTime();
      if (now - createdAt > sessionTtlMs) {
        return null;
      }

      return session;
    },

    createSessionToken() {
      const session: AdminSession = {
        isAdmin: true,
        createdAt: clock.now().toISOString(),
      };

      const payloadB64 = Buffer.from(JSON.stringify(session)).toString('base64url');
      const signature = sign(payloadB64);

      return `${payloadB64}.${signature}`;
    },
  };
};
