import { describe, expect, it } from 'vitest';
import { createNodeAdminSessionCrypto } from './node-admin-session-crypto.js';

const SECRET = 'a-32-character-secret-for-hmac!!';

describe('createNodeAdminSessionCrypto', () => {
  it('refuses a short session secret', () => {
    expect(() => createNodeAdminSessionCrypto('too-short')).toThrow(
      'sessionSecret must be at least 32 characters'
    );
  });

  it('compares fixed-size digests', () => {
    const crypto = createNodeAdminSessionCrypto(SECRET);
    const admin = crypto.digest('super-secret-password');

    expect(crypto.digestsMatch(crypto.digest('super-secret-password'), admin)).toBe(true);
    expect(crypto.digestsMatch(crypto.digest('a'), admin)).toBe(false);
    expect(crypto.digestsMatch(crypto.digest('a'.repeat(1000)), admin)).toBe(false);
    expect(admin).toHaveLength(64);
  });

  it('rejects a signature from another secret', () => {
    const crypto = createNodeAdminSessionCrypto(SECRET);
    const other = createNodeAdminSessionCrypto('a-different-32-char-secret-key!!');
    const payload = 'payload';

    expect(other.signatureMatches(payload, crypto.sign(payload))).toBe(false);
    expect(crypto.signatureMatches(payload, 'not-a-signature')).toBe(false);
  });
});
