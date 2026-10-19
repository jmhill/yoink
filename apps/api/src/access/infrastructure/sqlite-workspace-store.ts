import type { Database } from '../../database/types.js';
import { ResultAsync } from 'neverthrow';
import type { Organization } from '../domain/organization.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { Invitation } from '../domain/invitation.js';
import type { OwnerAssigned } from '../domain/membership-events.js';
import type { WorkspaceStore } from '../domain/workspace-store.js';
import {
  organizationStorageError,
  workspaceStorageError,
  type OrganizationStorageError,
  type WorkspaceStorageError,
} from '../domain/organization-errors.js';
import { eventInsert } from './membership-event-insert.js';
import { invitationInsertQuery } from './invitation-statements.js';
import {
  membershipInsertQuery,
  organizationInsertQuery,
} from './membership-statements.js';

export const createSqliteWorkspaceStore = (db: Database): WorkspaceStore => ({
  createWithOwner: (
    organization: Organization,
    membership: OrganizationMembership,
    event: OwnerAssigned
  ): ResultAsync<void, OrganizationStorageError> =>
    ResultAsync.fromPromise(
      db.batch(
        [
          organizationInsertQuery(organization),
          membershipInsertQuery(membership),
          eventInsert(event),
        ],
        'write'
      ),
      (error) => organizationStorageError('Failed to create workspace with owner', error)
    ).map(() => undefined),

  createWithOwnerInvite: (
    organization: Organization,
    invitation: Invitation
  ): ResultAsync<void, OrganizationStorageError> =>
    ResultAsync.fromPromise(
      db.batch(
        [organizationInsertQuery(organization), invitationInsertQuery(invitation)],
        'write'
      ),
      (error) =>
        organizationStorageError('Failed to create workspace with owner invite', error)
    ).map(() => undefined),

  listOwnershipRows: (): ResultAsync<
    readonly Record<string, unknown>[],
    WorkspaceStorageError
  > =>
    ResultAsync.fromPromise(
      db.execute({
        sql: `
          SELECT
            o.id AS id,
            o.name AS name,
            o.created_at AS createdAt,
            (
              SELECT m.user_id
              FROM organization_memberships m
              WHERE m.organization_id = o.id
                AND m.role = 'owner'
              LIMIT 1
            ) AS ownerUserId,
            EXISTS (
              SELECT 1
              FROM organization_memberships m
              WHERE m.organization_id = o.id
                AND m.is_personal_org = 1
            ) AS personal,
            i.email AS liveOwnerInviteEmail,
            i.expires_at AS liveOwnerInviteExpiresAt
          FROM organizations o
          LEFT JOIN invitations i
            ON i.organization_id = o.id
           AND i.role = 'owner'
           AND i.accepted_at IS NULL
           AND i.replaced_at IS NULL
          ORDER BY o.created_at DESC
        `,
      }),
      (error) => workspaceStorageError('Failed to list workspace ownership rows', error)
    ).map((result) => result.rows),
});
