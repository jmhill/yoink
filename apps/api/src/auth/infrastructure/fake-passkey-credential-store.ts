import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { PasskeyCredential } from '../domain/passkey-credential.js';
import type { PasskeyCredentialStore } from '../domain/passkey-credential-store.js';
import {
  passkeyCredentialStorageError,
  type PasskeyCredentialStorageError,
} from '../domain/auth-errors.js';

export type FakePasskeyCredentialStoreOptions = {
  shouldFailOnSave?: boolean;
  shouldFailOnFind?: boolean;
  shouldFailOnUpdate?: boolean;
  shouldFailOnDelete?: boolean;
  initialCredentials?: PasskeyCredential[];
};

export const createFakePasskeyCredentialStore = (
  options: FakePasskeyCredentialStoreOptions = {}
): PasskeyCredentialStore & { getAll(): PasskeyCredential[] } => {
  const credentials: PasskeyCredential[] = [...(options.initialCredentials ?? [])];

  return {
    /** Test helper to get all stored credentials */
    getAll: () => [...credentials],

    save: (credential: PasskeyCredential): ResultAsync<void, PasskeyCredentialStorageError> => {
      if (options.shouldFailOnSave) {
        return errAsync(passkeyCredentialStorageError('Save failed'));
      }
      credentials.push(credential);
      return okAsync(undefined);
    },

    findById: (credentialId: string): ResultAsync<PasskeyCredential | null, PasskeyCredentialStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(passkeyCredentialStorageError('Find failed'));
      }
      const found = credentials.find((c) => c.id === credentialId);
      return okAsync(found ?? null);
    },

    findByUserId: (userId: string): ResultAsync<PasskeyCredential[], PasskeyCredentialStorageError> => {
      if (options.shouldFailOnFind) {
        return errAsync(passkeyCredentialStorageError('Find failed'));
      }
      const found = credentials
        .filter((c) => c.userId === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return okAsync(found);
    },

    updateCounter: (
      credentialId: string,
      newCounter: number
    ): ResultAsync<void, PasskeyCredentialStorageError> => {
      if (options.shouldFailOnUpdate) {
        return errAsync(passkeyCredentialStorageError('Update failed'));
      }
      const index = credentials.findIndex((c) => c.id === credentialId);
      if (index >= 0) {
        credentials[index] = { ...credentials[index], counter: newCounter };
      }
      return okAsync(undefined);
    },

    updateLastUsed: (
      credentialId: string,
      timestamp: string
    ): ResultAsync<void, PasskeyCredentialStorageError> => {
      if (options.shouldFailOnUpdate) {
        return errAsync(passkeyCredentialStorageError('Update failed'));
      }
      const index = credentials.findIndex((c) => c.id === credentialId);
      if (index >= 0) {
        credentials[index] = { ...credentials[index], lastUsedAt: timestamp };
      }
      return okAsync(undefined);
    },

    delete: (credentialId: string): ResultAsync<void, PasskeyCredentialStorageError> => {
      if (options.shouldFailOnDelete) {
        return errAsync(passkeyCredentialStorageError('Delete failed'));
      }
      const index = credentials.findIndex((c) => c.id === credentialId);
      if (index >= 0) {
        credentials.splice(index, 1);
      }
      return okAsync(undefined);
    },
  };
};
