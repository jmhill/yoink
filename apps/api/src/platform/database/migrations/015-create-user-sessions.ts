import type { Migration } from '../types.js';

/**
 * Creates the user_sessions table for passkey-authenticated sessions.
 *
 * This is separate from admin_sessions (which remain password-based).
 * User sessions are created after successful passkey authentication.
 *
 * Key design decisions:
 * - Server-side session storage (not stateless JWT)
 * - current_organization_id: Tracks which org the user is currently viewing
 * - expires_at: 7-day session expiry
 * - last_active_at: For session refresh on activity
 */
export const migration: Migration = {
  version: 15,
  name: 'create_user_sessions',
  up: async (db) => {
    await db.execute({
      sql: `
        CREATE TABLE user_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          current_organization_id TEXT NOT NULL REFERENCES organizations(id),
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          last_active_at TEXT NOT NULL
        )
      `,
    });

    // Index for looking up sessions by user (for listing/revoking)
    await db.execute({
      sql: `CREATE INDEX idx_user_sessions_user ON user_sessions(user_id)`,
    });

    // Index for session cleanup (expired sessions)
    await db.execute({
      sql: `CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at)`,
    });
  },
};
