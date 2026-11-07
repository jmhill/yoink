/**
 * Port type. `@yoink/infrastructure` keeps the same shape for its hashers.
 * `platform/infrastructure-ports.test.ts` fails typecheck if they drift.
 */
export type PasswordHasher = {
  hash(plaintext: string): Promise<string>;
  compare(plaintext: string, hash: string): Promise<boolean>;
};
