import { describe, it, expect } from 'vitest';
import { createBcryptPasswordHasher } from './bcrypt-password-hasher.js';
import { createFakePasswordHasher } from './fake-password-hasher.js';
import type { PasswordHasher } from './password-hasher.js';

describe('PasswordHasher', () => {
  describe('BcryptPasswordHasher', () => {
    const hasher = createBcryptPasswordHasher();

    runPasswordHasherTests(hasher, 'bcrypt');

    it('produces different hashes for the same input (salted)', async () => {
      const password = 'my-secret-password';
      const hash1 = await hasher.hash(password);
      const hash2 = await hasher.hash(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('FakePasswordHasher', () => {
    const hasher = createFakePasswordHasher();

    runPasswordHasherTests(hasher, 'fake');

    it('produces predictable hashes for testing', async () => {
      const password = 'test-password';
      const hash1 = await hasher.hash(password);
      const hash2 = await hasher.hash(password);

      // Fake hasher uses deterministic hashing for easier test assertions
      expect(hash1).toBe(hash2);
    });
  });
});

function runPasswordHasherTests(hasher: PasswordHasher, name: string) {
  it(`${name}: compares correctly with matching password`, async () => {
    const password = 'my-secret-password';
    const hash = await hasher.hash(password);

    const result = await hasher.compare(password, hash);

    expect(result).toBe(true);
  });

  it(`${name}: compares correctly with wrong password`, async () => {
    const password = 'my-secret-password';
    const hash = await hasher.hash(password);

    const result = await hasher.compare('wrong-password', hash);

    expect(result).toBe(false);
  });

  it(`${name}: handles empty strings`, async () => {
    const hash = await hasher.hash('');

    expect(await hasher.compare('', hash)).toBe(true);
    expect(await hasher.compare('not-empty', hash)).toBe(false);
  });
}
