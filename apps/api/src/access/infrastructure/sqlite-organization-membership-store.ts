import type { Database } from '../../database/types.js';
import { errAsync, okAsync, ResultAsync } from 'neverthrow';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { OwnershipTransferPlan } from '../domain/owner-presence.js';
import type { Invitation } from '../domain/invitation.js';
import type { AcceptMembershipChange } from '../domain/decide-accept-invitation.js';
import type { AssignOwnerPlan } from '../domain/assign-owner-plan.js';
import {
  membershipStorageError,
  type MembershipStorageError,
} from '../domain/organization-errors.js';
import { eventInsert } from './membership-event-insert.js';
import type {
  MemberLeft,
  MemberRemoved,
  MemberRoleChanged,
  OwnerAssigned,
} from '../domain/membership-events.js';
import {
  invitationMarkAcceptedQuery,
  replacedQueries,
} from './invitation-statements.js';
import {
  membershipFromRow,
  membershipInsertQuery,
  membershipRoleUpdateQuery,
  planQueries,
} from './membership-statements.js';

const parseMembershipRow = (
  row: Record<string, unknown> | undefined,
  context: string
): ResultAsync<OrganizationMembership | null, MembershipStorageError> => {
  if (!row) {
    return okAsync(null);
  }
  const membership = membershipFromRow(row);
  if (!membership) {
    return errAsync(membershipStorageError(context));
  }
  return okAsync(membership);
};

const parseMembershipRows = (
  rows: Record<string, unknown>[],
  context: string
): ResultAsync<OrganizationMembership[], MembershipStorageError> => {
  const memberships: OrganizationMembership[] = [];
  for (const row of rows) {
    const membership = membershipFromRow(row);
    if (!membership) {
      return errAsync(membershipStorageError(context));
    }
    memberships.push(membership);
  }
  return okAsync(memberships);
};

const assignOwnerQueries = (
  plan: AssignOwnerPlan,
  event: OwnerAssigned,
  replaced: Invitation | null
) => [
  ...(plan.kind === 'add' ? [membershipInsertQuery(plan.membership)] : planQueries(plan.plan)),
  eventInsert(event),
  ...replacedQueries(replaced),
];

const acceptQueries = (
  accepted: Invitation,
  membershipChange: AcceptMembershipChange,
  event: OwnerAssigned | null
) => [
  invitationMarkAcceptedQuery(accepted),
  membershipChange.kind === 'add'
    ? membershipInsertQuery(membershipChange.membership)
    : membershipRoleUpdateQuery(membershipChange.membership),
  ...(event ? [eventInsert(event)] : []),
];

const validateSchema = async (db: Database): Promise<void> => {
  const result = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='organization_memberships'`,
  });

  if (result.rows.length === 0) {
    throw new Error(
      'OrganizationMembershipStore requires "organization_memberships" table. Ensure migrations have been run before starting the application.'
    );
  }

  const events = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='membership_events'`,
  });
  if (events.rows.length === 0) {
    throw new Error(
      'OrganizationMembershipStore requires "membership_events" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteOrganizationMembershipStore = async (
  db: Database
): Promise<OrganizationMembershipStore> => {
  await validateSchema(db);

  return {
    save: (membership: OrganizationMembership): ResultAsync<void, MembershipStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            INSERT INTO organization_memberships (id, user_id, organization_id, role, is_personal_org, joined_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, organization_id) DO UPDATE SET
              role = excluded.role,
              is_personal_org = excluded.is_personal_org
          `,
          args: [
            membership.id,
            membership.userId,
            membership.organizationId,
            membership.role,
            membership.isPersonalOrg ? 1 : 0,
            membership.joinedAt,
          ],
        }),
        (error) => membershipStorageError('Failed to save membership', error)
      ).map(() => undefined);
    },

    findById: (id: string): ResultAsync<OrganizationMembership | null, MembershipStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `SELECT * FROM organization_memberships WHERE id = ?`,
          args: [id],
        }),
        (error) => membershipStorageError('Failed to find membership by id', error)
      ).andThen((result) =>
        parseMembershipRow(result.rows[0], 'Failed to parse membership by id')
      );
    },

    findByUserAndOrg: (
      userId: string,
      organizationId: string
    ): ResultAsync<OrganizationMembership | null, MembershipStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            SELECT * FROM organization_memberships
            WHERE user_id = ? AND organization_id = ?
          `,
          args: [userId, organizationId],
        }),
        (error) => membershipStorageError('Failed to find membership', error)
      ).andThen((result) => parseMembershipRow(result.rows[0], 'Failed to parse membership'));
    },

    findByUserId: (userId: string): ResultAsync<OrganizationMembership[], MembershipStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            SELECT * FROM organization_memberships
            WHERE user_id = ?
            ORDER BY joined_at ASC
          `,
          args: [userId],
        }),
        (error) => membershipStorageError('Failed to find memberships by user', error)
      ).andThen((result) =>
        parseMembershipRows(result.rows, 'Failed to parse memberships by user')
      );
    },

    findByOrganizationId: (
      organizationId: string
    ): ResultAsync<OrganizationMembership[], MembershipStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `
            SELECT * FROM organization_memberships
            WHERE organization_id = ?
            ORDER BY joined_at ASC
          `,
          args: [organizationId],
        }),
        (error) => membershipStorageError('Failed to find memberships by organization', error)
      ).andThen((result) =>
        parseMembershipRows(result.rows, 'Failed to parse memberships by organization')
      );
    },

    delete: (id: string): ResultAsync<void, MembershipStorageError> => {
      return ResultAsync.fromPromise(
        db.execute({
          sql: `DELETE FROM organization_memberships WHERE id = ?`,
          args: [id],
        }),
        (error) => membershipStorageError('Failed to delete membership', error)
      ).map(() => undefined);
    },

    setOwner: (
      plan: OwnershipTransferPlan,
      event: OwnerAssigned,
      replaced: Invitation | null
    ): ResultAsync<void, MembershipStorageError> => {
      return ResultAsync.fromPromise(
        db.batch(
          [...planQueries(plan), eventInsert(event), ...replacedQueries(replaced)],
          'write'
        ),
        (error) => membershipStorageError('Failed to set owner', error)
      ).map(() => undefined);
    },

    transferOwnership: (plan, event): ResultAsync<void, MembershipStorageError> => {
      const queries = [...planQueries(plan), eventInsert(event)];
      return ResultAsync.fromPromise(
        db.batch(queries, 'write'),
        (error) => membershipStorageError('Failed to hand over ownership', error)
      ).map(() => undefined);
    },

    changeMemberRole: (
      membership,
      event: MemberRoleChanged
    ): ResultAsync<void, MembershipStorageError> => {
      return ResultAsync.fromPromise(
        db.batch(
          [
            {
              sql: `UPDATE organization_memberships SET role = ? WHERE id = ?`,
              args: [membership.role, membership.id],
            },
            eventInsert(event),
          ],
          'write'
        ),
        (error) => membershipStorageError('Failed to change member role', error)
      ).map(() => undefined);
    },

    removeMember: (
      membershipId,
      event: MemberRemoved | MemberLeft
    ): ResultAsync<void, MembershipStorageError> => {
      return ResultAsync.fromPromise(
        db.batch(
          [
            {
              sql: `DELETE FROM organization_memberships WHERE id = ?`,
              args: [membershipId],
            },
            eventInsert(event),
          ],
          'write'
        ),
        (error) => membershipStorageError('Failed to remove member', error)
      ).map(() => undefined);
    },

    assignOwnerFromInvite: (
      plan: AssignOwnerPlan,
      event: OwnerAssigned,
      replaced: Invitation | null
    ): ResultAsync<void, MembershipStorageError> => {
      return ResultAsync.fromPromise(
        db.batch(assignOwnerQueries(plan, event, replaced), 'write'),
        (error) => membershipStorageError('Failed to assign owner from invite', error)
      ).map(() => undefined);
    },

    acceptInvitation: (
      accepted: Invitation,
      membershipChange: AcceptMembershipChange,
      event: OwnerAssigned | null
    ): ResultAsync<void, MembershipStorageError> => {
      return ResultAsync.fromPromise(
        db.batch(acceptQueries(accepted, membershipChange, event), 'write'),
        (error) => membershipStorageError('Failed to accept invitation', error)
      ).map(() => undefined);
    },
  };
};
