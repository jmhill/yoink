import type { PasswordHasher } from './password-hasher.js';

const FAKE_PREFIX = 'fake-hash:';

export const createFakePasswordHasher = (): PasswordHasher => ({
  hash: async (plaintext: string): Promise<string> => {
    // Simple deterministic "hash" for testing - just prefix the value
    return `${FAKE_PREFIX}${plaintext}`;
  },
  compare: async (plaintext: string, hash: string): Promise<boolean> => {
    return hash === `${FAKE_PREFIX}${plaintext}`;
  },
});
