import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { AdminSessionCrypto } from '../domain/admin-session-crypto.js';

const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * SHA-256 digest, then a timing-safe compare of the fixed-size digests.
 * HMAC-SHA256 signs the already-encoded payload.
 */
export const createNodeAdminSessionCrypto = (sessionSecret: string): AdminSessionCrypto => {
  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error('sessionSecret must be at least 32 characters');
  }

  return {
    digest(value: string) {
      return createHash('sha256').update(value).digest('hex');
    },

    digestsMatch(left: string, right: string) {
      try {
        return timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
      } catch {
        return false;
      }
    },

    sign(payload: string) {
      const hmac = createHmac('sha256', sessionSecret);
      hmac.update(payload);
      return hmac.digest('base64url');
    },

    signatureMatches(payload: string, signature: string) {
      const expected = this.sign(payload);
      try {
        return timingSafeEqual(
          Buffer.from(signature, 'base64url'),
          Buffer.from(expected, 'base64url')
        );
      } catch {
        return false;
      }
    },
  };
};
