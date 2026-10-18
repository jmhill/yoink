import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { InvitationStore } from '../domain/invitation-store.js';
import type { OrganizationMembershipStore } from '../domain/organization-membership-store.js';
import type { OrganizationMembership } from '../domain/organization-membership.js';
import type { Invitation } from '../domain/invitation.js';
import {
  decideAcceptInvitation,
  type AcceptInvitation,
  type AcceptInvitationError,
} from '../domain/decide-accept-invitation.js';
import {
  acceptInvitationFailedError,
  type AcceptInvitationFailedError,
} from '../domain/invitation-errors.js';

export type HandleAcceptInvitationDeps = {
  invitationStore: InvitationStore;
  membershipStore: OrganizationMembershipStore;
  nextId: () => string;
  now: () => string;
};

export type HandleAcceptInvitationError = AcceptInvitationError | AcceptInvitationFailedError;

export const handleAcceptInvitation = (
  command: AcceptInvitation,
  deps: HandleAcceptInvitationDeps
): ResultAsync<Invitation, HandleAcceptInvitationError> => {
  return deps.invitationStore
    .findByCode(command.code)
    .mapErr((error) => acceptInvitationFailedError(error.cause ?? error))
    .andThen((invitation) => loadMembers(invitation, deps).andThen((members) => {
      const decision = decideAcceptInvitation({
        command,
        invitation,
        members,
        now: deps.now(),
        eventId: deps.nextId(),
        membershipId: deps.nextId(),
      });
      if (decision.isErr()) {
        return errAsync(decision.error);
      }
      return deps.membershipStore
        .acceptInvitation(
          decision.value.accepted,
          decision.value.membership,
          decision.value.event
        )
        .mapErr((error) => acceptInvitationFailedError(error.cause ?? error))
        .map(() => decision.value.accepted);
    }));
};

const loadMembers = (
  invitation: Invitation | null,
  deps: HandleAcceptInvitationDeps
): ResultAsync<readonly OrganizationMembership[], AcceptInvitationFailedError> => {
  if (invitation === null) {
    return okAsync([]);
  }
  return deps.membershipStore
    .findByOrganizationId(invitation.organizationId)
    .mapErr((error) => acceptInvitationFailedError(error.cause ?? error));
};
