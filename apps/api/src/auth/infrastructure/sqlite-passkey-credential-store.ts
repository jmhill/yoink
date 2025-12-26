import type { DatabaseSync } from 'node:sqlite';
import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { PasskeyCredential, PasskeyTransport } from '../domain/passkey-credential.js';
import type { PasskeyCredentialStore } from '../domain/passkey-credential-store.js';
import {
  passkeyCredentialStorageError,
  type PasskeyCredentialStorageError,
} from '../domain/auth-errors.js';

type PasskeyCredentialRow = {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  device_type: 'singleDevice' | 'multiDevice';
  backed_up: number; // SQLite stores booleans as 0/1
  name: string | null;
  created_at: string;
  last_used_at: string | null;
};

const rowToCredential = (row: PasskeyCredentialRow): PasskeyCredential => ({
  id: row.id,
  userId: row.user_id,
  publicKey: row.public_key,
  counter: row.counter,
  transports: row.transports ? (JSON.parse(row.transports) as PasskeyTransport[]) : undefined,
  deviceType: row.device_type,
  backedUp: row.backed_up === 1,
  name: row.name ?? undefined,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at ?? undefined,
});

/**
 * Validates that the required database schema exists.
 */
const validateSchema = (db: DatabaseSync): void => {
  const table = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='passkey_credentials'`)
    .get();

  if (!table) {
    throw new Error(
      'PasskeyCredentialStore requires "passkey_credentials" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqlitePasskeyCredentialStore = (db: DatabaseSync): PasskeyCredentialStore => {
  validateSchema(db);

  return {
    save: (credential: PasskeyCredential): ResultAsync<void, PasskeyCredentialStorageError> => {
      try {
        const stmt = db.prepare(`
          INSERT INTO passkey_credentials (
            id, user_id, public_key, counter, transports, device_type, backed_up, name, created_at, last_used_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          credential.id,
          credential.userId,
          credential.publicKey,
          credential.counter,
          credential.transports ? JSON.stringify(credential.transports) : null,
          credential.deviceType,
          credential.backedUp ? 1 : 0,
          credential.name ?? null,
          credential.createdAt,
          credential.lastUsedAt ?? null
        );
        return okAsync(undefined);
      } catch (error) {
        return errAsync(passkeyCredentialStorageError('Failed to save passkey credential', error));
      }
    },

    findById: (credentialId: string): ResultAsync<PasskeyCredential | null, PasskeyCredentialStorageError> => {
      try {
        const stmt = db.prepare(`
          SELECT * FROM passkey_credentials WHERE id = ?
        `);

        const row = stmt.get(credentialId) as PasskeyCredentialRow | undefined;
        return okAsync(row ? rowToCredential(row) : null);
      } catch (error) {
        return errAsync(passkeyCredentialStorageError('Failed to find passkey credential', error));
      }
    },

    findByUserId: (userId: string): ResultAsync<PasskeyCredential[], PasskeyCredentialStorageError> => {
      try {
        const stmt = db.prepare(`
          SELECT * FROM passkey_credentials WHERE user_id = ? ORDER BY created_at DESC
        `);

        const rows = stmt.all(userId) as PasskeyCredentialRow[];
        return okAsync(rows.map(rowToCredential));
      } catch (error) {
        return errAsync(passkeyCredentialStorageError('Failed to find passkey credentials by user', error));
      }
    },

    updateCounter: (
      credentialId: string,
      newCounter: number
    ): ResultAsync<void, PasskeyCredentialStorageError> => {
      try {
        const stmt = db.prepare(`
          UPDATE passkey_credentials SET counter = ? WHERE id = ?
        `);

        stmt.run(newCounter, credentialId);
        return okAsync(undefined);
      } catch (error) {
        return errAsync(passkeyCredentialStorageError('Failed to update passkey credential counter', error));
      }
    },

    updateLastUsed: (
      credentialId: string,
      timestamp: string
    ): ResultAsync<void, PasskeyCredentialStorageError> => {
      try {
        const stmt = db.prepare(`
          UPDATE passkey_credentials SET last_used_at = ? WHERE id = ?
        `);

        stmt.run(timestamp, credentialId);
        return okAsync(undefined);
      } catch (error) {
        return errAsync(passkeyCredentialStorageError('Failed to update passkey credential last used', error));
      }
    },

    delete: (credentialId: string): ResultAsync<void, PasskeyCredentialStorageError> => {
      try {
        const stmt = db.prepare(`
          DELETE FROM passkey_credentials WHERE id = ?
        `);

        stmt.run(credentialId);
        return okAsync(undefined);
      } catch (error) {
        return errAsync(passkeyCredentialStorageError('Failed to delete passkey credential', error));
      }
    },
  };
};
