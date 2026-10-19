import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import type { Invitation } from '../domain/invitation.js';
import { invitationStatus } from '../domain/invitation.js';
import { ownerOf } from '../domain/owner-presence.js';
import {
  decideWorkspaceSummary,
  type WorkspaceRowInvalid,
} from '../domain/workspace-owner-status.js';
import {
  organizationNotFoundError,
  type OrganizationNotFoundError,
} from '../domain/admin-errors.js';
import {
  issueOwnerInvitationFailedError,
  type IssueOwnerInvitationFailedError,
} from '../domain/invitation-errors.js';

export type HandleGetOwnerInvitationDeps = {
  organizationStore: OrganizationStore;
  membershipStore: OrganizationMembershipStore;
  invitationStore: InvitationStore;
  now: () => string;
};

export type OwnerInvitationRead = {
  ownerInvitation: Invitation | null;
  expiredOwnerInvitation: { email: string; expiredAt: string } | null;
};

export type HandleGetOwnerInvitationError =
  | OrganizationNotFoundError
  | IssueOwnerInvitationFailedError
  | WorkspaceRowInvalid;

export const handleGetOwnerInvitation = (
  organizationId: string,
  deps: HandleGetOwnerInvitationDeps
): ResultAsync<OwnerInvitationRead, HandleGetOwnerInvitationError> => {
  return deps.organizationStore
    .findById(organizationId)
    .mapErr((error) => issueOwnerInvitationFailedError(error.cause ?? error))
    .andThen((organization) => {
      if (!organization) {
        return errAsync(organizationNotFoundError(organizationId));
      }
      return deps.membershipStore
        .findByOrganizationId(organizationId)
        .mapErr((error) => issueOwnerInvitationFailedError(error.cause ?? error))
        .andThen((members) =>
          deps.invitationStore
            .findLiveOwnerInvitation(organizationId)
            .mapErr((error) => issueOwnerInvitationFailedError(error.cause ?? error))
            .andThen((invitation) => {
              const decision = decideWorkspaceSummary({
                row: {
                  id: organization.id,
                  name: organization.name,
                  createdAt: organization.createdAt,
                  ownerUserId: ownerOf(members)?.userId ?? null,
                  personal: members.some((membership) => membership.isPersonalOrg),
                  liveOwnerInviteEmail: invitation?.email ?? null,
                  liveOwnerInviteExpiresAt: invitation?.expiresAt ?? null,
                },
                now: deps.now(),
              });
              if (decision.isErr()) {
                return errAsync(decision.error);
              }
              const pending =
                invitation && invitationStatus(invitation, deps.now()) === 'pending'
                  ? invitation
                  : null;
              const expiredOwnerInvitation =
                decision.value.ownerStatus.kind === 'no-owner'
                  ? decision.value.ownerStatus.expiredInvite
                  : null;
              return okAsync({
                ownerInvitation: pending,
                expiredOwnerInvitation,
              });
            })
        );
    });
};
