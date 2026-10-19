import { errAsync, ResultAsync } from 'neverthrow';
import type { Organization } from '../domain/organization.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { Invitation } from '../domain/invitation.js';
import type { OwnerAssigned } from '../domain/membership-events.js';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import type { WorkspaceStore } from '../domain/workspace-store.js';
import {
  organizationStorageError,
  workspaceStorageError,
  type OrganizationStorageError,
  type WorkspaceStorageError,
} from '../domain/organization-errors.js';

export type FakeWorkspaceStoreOptions = {
  organizationStore: OrganizationStore;
  membershipStore: OrganizationMembershipStore;
  invitationStore: InvitationStore;
  shouldFailOnCreateWorkspace?: boolean;
  shouldFailOnListOwnershipRows?: boolean;
};

export type FakeWorkspaceStore = WorkspaceStore & {
  recordedEvents(): readonly OwnerAssigned[];
};

export const createFakeWorkspaceStore = (
  options: FakeWorkspaceStoreOptions
): FakeWorkspaceStore => {
  const events: OwnerAssigned[] = [];

  return {
    createWithOwner: (
      organization: Organization,
      membership: OrganizationMembership,
      event: OwnerAssigned
    ): ResultAsync<void, OrganizationStorageError> => {
      if (options.shouldFailOnCreateWorkspace) {
        return errAsync(
          organizationStorageError('Failed to create workspace with owner', new Error('injected'))
        );
      }
      return options.organizationStore
        .save(organization)
        .andThen(() =>
          options.membershipStore
            .save(membership)
            .mapErr((error) =>
              organizationStorageError(error.message, error.cause ?? error)
            )
        )
        .map(() => {
          events.push(event);
        });
    },

    createWithOwnerInvite: (
      organization: Organization,
      invitation: Invitation
    ): ResultAsync<void, OrganizationStorageError> => {
      if (options.shouldFailOnCreateWorkspace) {
        return errAsync(
          organizationStorageError(
            'Failed to create workspace with owner invite',
            new Error('injected')
          )
        );
      }
      return options.organizationStore
        .save(organization)
        .andThen(() =>
          options.invitationStore
            .save(invitation)
            .mapErr((error) =>
              organizationStorageError(error.message, error.cause ?? error)
            )
        );
    },

    listOwnershipRows: (): ResultAsync<
      readonly Record<string, unknown>[],
      WorkspaceStorageError
    > => {
      if (options.shouldFailOnListOwnershipRows) {
        return errAsync(
          workspaceStorageError(
            'Failed to list workspace ownership rows',
            new Error('injected')
          )
        );
      }
      return options.organizationStore
        .findAll()
        .mapErr((error) => workspaceStorageError(error.message, error.cause ?? error))
        .andThen((organizations) => {
          const ordered = [...organizations].sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt)
          );
          return ResultAsync.combine(
            ordered.map((organization) =>
              options.membershipStore
                .findByOrganizationId(organization.id)
                .mapErr((error) =>
                  workspaceStorageError(error.message, error.cause ?? error)
                )
                .andThen((members) =>
                  options.invitationStore
                    .findByOrganization(organization.id)
                    .mapErr((error) =>
                      workspaceStorageError(error.message, error.cause ?? error)
                    )
                    .map((invitations) => {
                      const owner = members.find((membership) => membership.role === 'owner');
                      const live = invitations.find(
                        (invitation) =>
                          invitation.role === 'owner' &&
                          invitation.acceptedAt === null &&
                          invitation.replacedAt === null
                      );
                      return {
                        id: organization.id,
                        name: organization.name,
                        createdAt: organization.createdAt,
                        ownerUserId: owner?.userId ?? null,
                        personal: members.some((membership) => membership.isPersonalOrg),
                        liveOwnerInviteEmail: live?.email ?? null,
                        liveOwnerInviteExpiresAt: live?.expiresAt ?? null,
                      };
                    })
                )
            )
          );
        });
    },

    recordedEvents: () => events,
  };
};
