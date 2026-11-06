/** Same shape as `apps/api/src/kernel/password-hasher.ts`. The ports test locks that. */
export type PasswordHasher = {
  hash(plaintext: string): Promise<string>;
  compare(plaintext: string, hash: string): Promise<boolean>;
};
