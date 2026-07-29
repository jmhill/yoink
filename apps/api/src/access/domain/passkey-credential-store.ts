import type { ResultAsync } from 'neverthrow';
import type { PasskeyCredential } from './passkey-credential.js';
import type { PasskeyCredentialStorageError } from './auth-errors.js';

/**
 * Port interface for passkey credential persistence.
 */
export type PasskeyCredentialStore = {
  /** Save a new passkey credential */
  save(credential: PasskeyCredential): ResultAsync<void, PasskeyCredentialStorageError>;

  /** Find a credential by its WebAuthn credential ID */
  findById(credentialId: string): ResultAsync<PasskeyCredential | null, PasskeyCredentialStorageError>;

  /** Find all credentials for a user */
  findByUserId(userId: string): ResultAsync<PasskeyCredential[], PasskeyCredentialStorageError>;

  /** Update the signature counter (after successful authentication) */
  updateCounter(
    credentialId: string,
    newCounter: number
  ): ResultAsync<void, PasskeyCredentialStorageError>;

  /** Update the last used timestamp (after successful authentication) */
  updateLastUsed(
    credentialId: string,
    timestamp: string
  ): ResultAsync<void, PasskeyCredentialStorageError>;

  /** Delete a credential */
  delete(credentialId: string): ResultAsync<void, PasskeyCredentialStorageError>;
};
