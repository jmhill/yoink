import { errAsync, type ResultAsync } from 'neverthrow';
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
  type OrganizationStorageError,
} from '../domain/organization-errors.js';

export type FakeWorkspaceStoreOptions = {
  organizationStore: OrganizationStore;
  membershipStore: OrganizationMembershipStore;
  invitationStore: InvitationStore;
  shouldFailOnCreateWorkspace?: boolean;
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

    recordedEvents: () => events,
  };
};
