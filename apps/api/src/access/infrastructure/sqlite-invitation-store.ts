import type { Database } from '../../database/types.js';
import { err, errAsync, ok, okAsync, Result, ResultAsync } from 'neverthrow';
import type { Invitation } from '../domain/invitation.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import {
  invitationStorageError,
  type InvitationStorageError,
} from '../domain/invitation-errors.js';
import {
  invitationFromRow,
  invitationInsertQuery,
  invitationUpsertQuery,
  replacedQueries,
} from './invitation-statements.js';

const parseInvitationRow = (
  row: Record<string, unknown> | undefined,
  context: string
): ResultAsync<Invitation | null, InvitationStorageError> => {
  if (!row) {
    return okAsync(null);
  }
  const invitation = invitationFromRow(row);
  if (!invitation) {
    return errAsync(invitationStorageError(context));
  }
  return okAsync(invitation);
};

const invitationFromUnknown = (
  row: Record<string, unknown>,
  context: string
): Result<Invitation, InvitationStorageError> => {
  const invitation = invitationFromRow(row);
  return invitation ? ok(invitation) : err(invitationStorageError(context));
};

const parseInvitationRows = (
  rows: Record<string, unknown>[],
  context: string
): ResultAsync<Invitation[], InvitationStorageError> => {
  const parsed = Result.combine(rows.map((row) => invitationFromUnknown(row, context)));
  return parsed.isOk() ? okAsync(parsed.value) : errAsync(parsed.error);
};

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
        db.execute(invitationUpsertQuery(invitation)),
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
      ).andThen((result) =>
        parseInvitationRow(result.rows[0], 'Failed to parse invitation by id')
      );
    },

    findByCode: (code: string): ResultAsync<Invitation | null, InvitationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM invitations WHERE code = ?`,
          args: [code],
        }),
        (error) => invitationStorageError('Failed to find invitation by code', error)
      ).andThen((result) =>
        parseInvitationRow(result.rows[0], 'Failed to parse invitation by code')
      );
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
              AND replaced_at IS NULL
              AND expires_at > ?
            ORDER BY created_at DESC
          `,
          args: [organizationId, currentTime],
        }),
        (error) => invitationStorageError('Failed to find pending invitations', error)
      ).andThen((result) =>
        parseInvitationRows(result.rows, 'Failed to parse pending invitations')
      );
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
      ).andThen((result) =>
        parseInvitationRows(result.rows, 'Failed to parse invitations by organization')
      );
    },

    delete: (id: string): ResultAsync<void, InvitationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `DELETE FROM invitations WHERE id = ?`,
          args: [id],
        }),
        (error) => invitationStorageError('Failed to delete invitation', error)
      ).map(() => undefined);
    },

    findLiveOwnerInvitation: (
      organizationId: string
    ): ResultAsync<Invitation | null, InvitationStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            SELECT * FROM invitations
            WHERE organization_id = ?
              AND role = 'owner'
              AND accepted_at IS NULL
              AND replaced_at IS NULL
            LIMIT 1
          `,
          args: [organizationId],
        }),
        (error) => invitationStorageError('Failed to find live owner invitation', error)
      ).andThen((result) =>
        parseInvitationRow(result.rows[0], 'Failed to parse live owner invitation')
      );
    },

    issueOwnerInvitation: (
      invitation: Invitation,
      replaced: Invitation | null
    ): ResultAsync<void, InvitationStorageError> => {
      return ResultAsync.fromPromise(
        db.batch(
          [...replacedQueries(replaced), invitationInsertQuery(invitation)],
          'write'
        ),
        (error) => invitationStorageError('Failed to issue owner invitation', error)
      ).map(() => undefined);
    },
  };
};
