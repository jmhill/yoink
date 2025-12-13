import bcrypt from 'bcrypt';
import type { PasswordHasher } from './password-hasher.js';

const SALT_ROUNDS = 10;

export const createBcryptPasswordHasher = (): PasswordHasher => ({
  hash: async (plaintext: string): Promise<string> => {
    return bcrypt.hash(plaintext, SALT_ROUNDS);
  },
  compare: async (plaintext: string, hash: string): Promise<boolean> => {
    return bcrypt.compare(plaintext, hash);
  },
});
