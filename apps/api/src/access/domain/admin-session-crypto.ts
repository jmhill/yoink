/**
 * SHA-256 and HMAC for an admin session. The implementation lives in
 * infrastructure. The secret and the raw password do not enter a plan.
 */
export type AdminSessionCrypto = {
  digest(value: string): string;
  digestsMatch(left: string, right: string): boolean;
  sign(payload: string): string;
  signatureMatches(payload: string, signature: string): boolean;
};
