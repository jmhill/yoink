import type { Database } from '../../database/types.js';
import { ResultAsync } from 'neverthrow';
import type { Invitation, InvitationRole } from '../domain/invitation.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import {
  invitationStorageError,
  type InvitationStorageError,
} from '../domain/invitation-errors.js';

type InvitationRow = {
  id: string;
  code: string;
  email: string | null;
  organization_id: string;
  invited_by_user_id: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  created_at: string;
};

const rowToInvitation = (row: InvitationRow): Invitation => ({
  id: row.id,
  code: row.code,
  email: row.email,
  organizationId: row.organization_id,
  invitedByUserId: row.invited_by_user_id,
  role: row.role as InvitationRole,
  expiresAt: row.expires_at,
  acceptedAt: row.accepted_at,
  acceptedByUserId: row.accepted_by_user_id,
  createdAt: row.created_at,
});

/**
 * Validates that the required database schema exists.
 * Throws an error if migrations have not been run.
 */
const validateSchema = async (db: Database): Promise<void> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='invitations'`,
  });

  if (result.rows.length === 0) {
    throw new Error(
      'InvitationStore requires "invitations" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteInvitationStore = async (
  db: Database
): Promise<InvitationStore> => {
  await validateSchema(db);

  return {
    save: (invitation: Invitation): ResultAsync<void, InvitationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            INSERT INTO invitations (
              id, code, email, organization_id, invited_by_user_id, 
              role, expires_at, accepted_at, accepted_by_user_id, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
              code = excluded.code,
              email = excluded.email,
              role = excluded.role,
              expires_at = excluded.expires_at,
              accepted_at = excluded.accepted_at,
              accepted_by_user_id = excluded.accepted_by_user_id
          `,
          args: [
            invitation.id,
            invitation.code,
            invitation.email,
            invitation.organizationId,
            invitation.invitedByUserId,
            invitation.role,
            invitation.expiresAt,
            invitation.acceptedAt,
            invitation.acceptedByUserId,
            invitation.createdAt,
          ],
        }),
        (error) => invitationStorageError('Failed to save invitation', error)
      ).map(() => undefined);
    },

    findById: (id: string): ResultAsync<Invitation | null, InvitationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM invitations WHERE id = ?`,
          args: [id],
        }),
        (error) => invitationStorageError('Failed to find invitation by id', error)
      ).map((result) => {
        const row = result.rows[0] as InvitationRow | undefined;
        return row ? rowToInvitation(row) : null;
      });
    },

    findByCode: (code: string): ResultAsync<Invitation | null, InvitationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM invitations WHERE code = ?`,
          args: [code],
        }),
        (error) => invitationStorageError('Failed to find invitation by code', error)
      ).map((result) => {
        const row = result.rows[0] as InvitationRow | undefined;
        return row ? rowToInvitation(row) : null;
      });
    },

    findPendingByOrganization: (
      organizationId: string,
      currentTime: string
    ): ResultAsync<Invitation[], InvitationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            SELECT * FROM invitations 
            WHERE organization_id = ? 
              AND accepted_at IS NULL 
              AND expires_at > ?
            ORDER BY created_at DESC
          `,
          args: [organizationId, currentTime],
        }),
        (error) => invitationStorageError('Failed to find pending invitations', error)
      ).map((result) => {
        const rows = result.rows as InvitationRow[];
        return rows.map(rowToInvitation);
      });
    },

    findByOrganization: (
      organizationId: string
    ): ResultAsync<Invitation[], InvitationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            SELECT * FROM invitations 
            WHERE organization_id = ?
            ORDER BY created_at DESC
          `,
          args: [organizationId],
        }),
        (error) => invitationStorageError('Failed to find invitations by organization', error)
      ).map((result) => {
        const rows = result.rows as InvitationRow[];
        return rows.map(rowToInvitation);
      });
    },
  };
};
