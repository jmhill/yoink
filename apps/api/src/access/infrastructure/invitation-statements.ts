import type { Invitation, InvitationRole } from '../domain/invitation.js';

const invitationRoleOf = (value: unknown): InvitationRole | null => {
  if (value === 'owner' || value === 'admin' || value === 'member') {
    return value;
  }
  return null;
};

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const asNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'string' ? value : null;
};

export const invitationFromRow = (row: Record<string, unknown>): Invitation | null => {
  const id = asString(row.id);
  const code = asString(row.code);
  const organizationId = asString(row.organization_id);
  const role = invitationRoleOf(row.role);
  const expiresAt = asString(row.expires_at);
  const createdAt = asString(row.created_at);
  if (!id || !code || !organizationId || !role || !expiresAt || !createdAt) {
    return null;
  }
  return {
    id,
    code,
    email: asNullableString(row.email),
    organizationId,
    invitedByUserId: asNullableString(row.invited_by_user_id),
    role,
    expiresAt,
    acceptedAt: asNullableString(row.accepted_at),
    acceptedByUserId: asNullableString(row.accepted_by_user_id),
    replacedAt: asNullableString(row.replaced_at),
    createdAt,
  };
};

const invitationArgs = (invitation: Invitation): unknown[] => [
  invitation.id,
  invitation.code,
  invitation.email,
  invitation.organizationId,
  invitation.invitedByUserId,
  invitation.role,
  invitation.expiresAt,
  invitation.acceptedAt,
  invitation.acceptedByUserId,
  invitation.replacedAt,
  invitation.createdAt,
];

const INVITATION_INSERT_SQL = `
  INSERT INTO invitations (
    id, code, email, organization_id, invited_by_user_id,
    role, expires_at, accepted_at, accepted_by_user_id, replaced_at, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const invitationInsertQuery = (invitation: Invitation) => ({
  sql: INVITATION_INSERT_SQL,
  args: invitationArgs(invitation),
});

export const invitationUpsertQuery = (invitation: Invitation) => ({
  sql: `
    ${INVITATION_INSERT_SQL}
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      email = excluded.email,
      role = excluded.role,
      expires_at = excluded.expires_at,
      accepted_at = excluded.accepted_at,
      accepted_by_user_id = excluded.accepted_by_user_id,
      replaced_at = excluded.replaced_at
  `,
  args: invitationArgs(invitation),
});

export const invitationMarkReplacedQuery = (invitation: Invitation) => ({
  sql: `UPDATE invitations SET replaced_at = ? WHERE id = ?`,
  args: [invitation.replacedAt, invitation.id],
});

export const invitationMarkAcceptedQuery = (invitation: Invitation) => ({
  sql: `UPDATE invitations SET accepted_at = ?, accepted_by_user_id = ? WHERE id = ?`,
  args: [invitation.acceptedAt, invitation.acceptedByUserId, invitation.id],
});

export const replacedQueries = (replaced: Invitation | null) =>
  replaced === null ? [] : [invitationMarkReplacedQuery(replaced)];
