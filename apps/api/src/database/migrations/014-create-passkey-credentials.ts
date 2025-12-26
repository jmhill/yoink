import type { Migration } from '../types.js';

/**
 * Creates the passkey_credentials table for WebAuthn/FIDO2 authentication.
 *
 * Key design decisions:
 * - id: Base64URL credential ID (from WebAuthn response)
 * - public_key: Base64URL encoded COSE public key
 * - counter: Signature counter for replay detection
 * - transports: JSON array of transports (usb, nfc, ble, internal, hybrid)
 * - device_type: singleDevice (hardware key) or multiDevice (synced passkey)
 * - backed_up: Whether the credential is backed up (synced to cloud)
 * - name: User-friendly name (e.g., "MacBook Pro", "iPhone 15")
 */
export const migration: Migration = {
  version: 14,
  name: 'create_passkey_credentials',
  up: (db) => {
    db.exec(`
      CREATE TABLE passkey_credentials (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        public_key TEXT NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        transports TEXT,
        device_type TEXT NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
        backed_up INTEGER NOT NULL DEFAULT 0,
        name TEXT,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      )
    `);

    // Index for listing credentials by user
    db.exec(`CREATE INDEX idx_passkey_credentials_user_id ON passkey_credentials(user_id)`);
  },
};
