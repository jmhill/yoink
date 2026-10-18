import { errAsync, type ResultAsync } from 'neverthrow';
import type { OrganizationStore } from '../domain/organization-store.js';
import type { InvitationStore } from '../domain/invitation-store.js';
import type { Invitation } from '../domain/invitation.js';
import { invitationStatus } from '../domain/invitation.js';
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
  invitationStore: InvitationStore;
  now: () => string;
};

export type HandleGetOwnerInvitationError =
  | OrganizationNotFoundError
  | IssueOwnerInvitationFailedError;

export const handleGetOwnerInvitation = (
  organizationId: string,
  deps: HandleGetOwnerInvitationDeps
): ResultAsync<Invitation | null, HandleGetOwnerInvitationError> => {
  return deps.organizationStore
    .findById(organizationId)
    .mapErr((error) => issueOwnerInvitationFailedError(error.cause ?? error))
    .andThen((organization) => {
      if (!organization) {
        return errAsync(organizationNotFoundError(organizationId));
      }
      return deps.invitationStore
        .findLiveOwnerInvitation(organizationId)
        .mapErr((error) => issueOwnerInvitationFailedError(error.cause ?? error))
        .map((invitation) => {
          if (!invitation) {
            return null;
          }
          return invitationStatus(invitation, deps.now()) === 'pending' ? invitation : null;
        });
    });
};
