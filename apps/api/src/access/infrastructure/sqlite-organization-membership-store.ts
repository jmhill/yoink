import type { Database } from '../../database/types.js';
import { ResultAsync } from 'neverthrow';
import type { OrganizationMembership, MembershipRole } from '../domain/organization-membership.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { OwnershipTransferPlan } from '../domain/owner-presence.js';
import {
  membershipStorageError,
  type MembershipStorageError,
} from '../domain/organization-errors.js';
import { eventInsert } from './membership-event-insert.js';
import type { MemberLeft, MemberRemoved, MemberRoleChanged } from '../domain/membership-events.js';

type MembershipRow = {
  id: string;
  user_id: string;
  organization_id: string;
  role: string;
  is_personal_org: number;
  joined_at: string;
};

const rowToMembership = (row: MembershipRow): OrganizationMembership => ({
  id: row.id,
  userId: row.user_id,
  organizationId: row.organization_id,
  role: row.role as MembershipRole,
  isPersonalOrg: row.is_personal_org === 1,
  joinedAt: row.joined_at,
});

/**
 * Validates that the required database schema exists.
 * Throws an error if migrations have not been run.
 */
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
      ).map((result) => {
        const row = result.rows[0] as MembershipRow | undefined;
        return row ? rowToMembership(row) : null;
      });
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
      ).map((result) => {
        const row = result.rows[0] as MembershipRow | undefined;
        return row ? rowToMembership(row) : null;
      });
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
      ).map((result) => {
        const rows = result.rows as MembershipRow[];
        return rows.map(rowToMembership);
      });
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
      ).map((result) => {
        const rows = result.rows as MembershipRow[];
        return rows.map(rowToMembership);
      });
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

    setOwner: ({ demote, promote }): ResultAsync<void, MembershipStorageError> => {
      const queries = planQueries({ demote, promote });
      return ResultAsync.fromPromise(
        db.batch(queries, 'write'),
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
  };
};

const planQueries = ({ demote, promote }: OwnershipTransferPlan) => [
  ...(demote
    ? [
        {
          sql: `UPDATE organization_memberships SET role = ? WHERE id = ?`,
          args: [demote.role, demote.id],
        },
      ]
    : []),
  {
    sql: `UPDATE organization_memberships SET role = ? WHERE id = ?`,
    args: [promote.role, promote.id],
  },
];
