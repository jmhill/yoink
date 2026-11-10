import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ChallengeCrypto } from '../domain/challenge.js';

/** The only `node:crypto` use for WebAuthn challenges. */
export const nodeChallengeCrypto: ChallengeCrypto = {
  randomBytes(size: number): Buffer {
    return randomBytes(size);
  },
  hmacSha256(secret: string, data: Buffer): Buffer {
    const hmac = createHmac('sha256', secret);
    hmac.update(data);
    return hmac.digest();
  },
  timingSafeEqual(left: Buffer, right: Buffer): boolean {
    return timingSafeEqual(left, right);
  },
};
