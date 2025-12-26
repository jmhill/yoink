import type { DatabaseSync } from 'node:sqlite';
import { okAsync, errAsync, type ResultAsync } from 'neverthrow';
import type { OrganizationMembership, MembershipRole } from '../domain/organization-membership.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import {
  membershipStorageError,
  type MembershipStorageError,
} from '../domain/auth-errors.js';

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
const validateSchema = (db: DatabaseSync): void => {
  const table = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='organization_memberships'`
    )
    .get();

  if (!table) {
    throw new Error(
      'OrganizationMembershipStore requires "organization_memberships" table. Ensure migrations have been run before starting the application.'
    );
  }
};

export const createSqliteOrganizationMembershipStore = (
  db: DatabaseSync
): OrganizationMembershipStore => {
  validateSchema(db);

  return {
    save: (membership: OrganizationMembership): ResultAsync<void, MembershipStorageError> => {
      try {
        const stmt = db.prepare(`
          INSERT INTO organization_memberships (id, user_id, organization_id, role, is_personal_org, joined_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, organization_id) DO UPDATE SET 
            role = excluded.role,
            is_personal_org = excluded.is_personal_org
        `);

        stmt.run(
          membership.id,
          membership.userId,
          membership.organizationId,
          membership.role,
          membership.isPersonalOrg ? 1 : 0,
          membership.joinedAt
        );
        return okAsync(undefined);
      } catch (error) {
        return errAsync(membershipStorageError('Failed to save membership', error));
      }
    },

    findById: (id: string): ResultAsync<OrganizationMembership | null, MembershipStorageError> => {
      try {
        const stmt = db.prepare(`SELECT * FROM organization_memberships WHERE id = ?`);
        const row = stmt.get(id) as MembershipRow | undefined;
        return okAsync(row ? rowToMembership(row) : null);
      } catch (error) {
        return errAsync(membershipStorageError('Failed to find membership by id', error));
      }
    },

    findByUserAndOrg: (
      userId: string,
      organizationId: string
    ): ResultAsync<OrganizationMembership | null, MembershipStorageError> => {
      try {
        const stmt = db.prepare(`
          SELECT * FROM organization_memberships 
          WHERE user_id = ? AND organization_id = ?
        `);

        const row = stmt.get(userId, organizationId) as MembershipRow | undefined;
        return okAsync(row ? rowToMembership(row) : null);
      } catch (error) {
        return errAsync(membershipStorageError('Failed to find membership', error));
      }
    },

    findByUserId: (userId: string): ResultAsync<OrganizationMembership[], MembershipStorageError> => {
      try {
        const stmt = db.prepare(`
          SELECT * FROM organization_memberships 
          WHERE user_id = ?
          ORDER BY joined_at ASC
        `);

        const rows = stmt.all(userId) as MembershipRow[];
        return okAsync(rows.map(rowToMembership));
      } catch (error) {
        return errAsync(membershipStorageError('Failed to find memberships by user', error));
      }
    },

    findByOrganizationId: (
      organizationId: string
    ): ResultAsync<OrganizationMembership[], MembershipStorageError> => {
      try {
        const stmt = db.prepare(`
          SELECT * FROM organization_memberships 
          WHERE organization_id = ?
          ORDER BY joined_at ASC
        `);

        const rows = stmt.all(organizationId) as MembershipRow[];
        return okAsync(rows.map(rowToMembership));
      } catch (error) {
        return errAsync(membershipStorageError('Failed to find memberships by organization', error));
      }
    },

    delete: (id: string): ResultAsync<void, MembershipStorageError> => {
      try {
        const stmt = db.prepare(`DELETE FROM organization_memberships WHERE id = ?`);
        stmt.run(id);
        return okAsync(undefined);
      } catch (error) {
        return errAsync(membershipStorageError('Failed to delete membership', error));
      }
    },
  };
};
