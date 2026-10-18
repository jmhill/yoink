import type { ResultAsync } from 'neverthrow';
import type { Organization } from './organization.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { Invitation } from './invitation.js';
import type { OwnerAssigned } from './membership-events.js';
import type { OrganizationStorageError } from './organization-errors.js';

export type WorkspaceStore = {
  createWithOwner(
    organization: Organization,
    membership: OrganizationMembership,
    event: OwnerAssigned
  ): ResultAsync<void, OrganizationStorageError>;

  createWithOwnerInvite(
    organization: Organization,
    invitation: Invitation
  ): ResultAsync<void, OrganizationStorageError>;
};
