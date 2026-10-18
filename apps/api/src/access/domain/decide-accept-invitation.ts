import { err, ok, type Result } from 'neverthrow';
import { normalizeEmail } from '@yoink/api-contracts';
import type { Invitation } from './invitation.js';
import {
  invitationStatus,
  markInvitationAccepted,
} from './invitation.js';
import type { OrganizationMembership } from './organization-membership.js';
import type { OwnerAssigned } from './membership-events.js';
import { ownerOf } from './owner-presence.js';
import {
  alreadyMemberOfOrgError,
  invitationAlreadyAcceptedError,
  invitationExpiredError,
  invitationNotFoundError,
  invitationReplacedError,
  ownerInviteEmailMismatchError,
  workspaceAlreadyHasOwnerError,
  type AlreadyMemberOfOrgError,
  type InvitationAlreadyAcceptedError,
  type InvitationEmailMismatchError,
  type InvitationExpiredError,
  type InvitationNotFoundError,
  type InvitationReplacedError,
  type WorkspaceAlreadyHasOwnerError,
} from './invitation-errors.js';

export type AcceptInvitation = {
  code: string;
  account: { userId: string; email: string };
};

export type AcceptMembershipChange =
  | { kind: 'add'; membership: OrganizationMembership }
  | { kind: 'promote'; membership: OrganizationMembership };

export type AcceptDecision = {
  accepted: Invitation;
  membership: AcceptMembershipChange;
  event: OwnerAssigned | null;
};

export type DecideAcceptInvitationInput = {
  command: AcceptInvitation;
  invitation: Invitation | null;
  members: readonly OrganizationMembership[];
  now: string;
  eventId: string;
  membershipId: string;
};

export type AcceptInvitationError =
  | InvitationNotFoundError
  | InvitationReplacedError
  | InvitationExpiredError
  | InvitationAlreadyAcceptedError
  | InvitationEmailMismatchError
  | WorkspaceAlreadyHasOwnerError
  | AlreadyMemberOfOrgError;

const emailsMatch = (expected: string, actual: string): boolean =>
  normalizeEmail(expected) === normalizeEmail(actual);

export const decideAcceptInvitation = ({
  command,
  invitation,
  members,
  now,
  eventId,
  membershipId,
}: DecideAcceptInvitationInput): Result<AcceptDecision, AcceptInvitationError> => {
  if (!invitation) {
    return err(invitationNotFoundError({ code: command.code }));
  }

  const status = invitationStatus(invitation, now);
  switch (status) {
    case 'replaced':
      return err(
        invitationReplacedError(invitation.code, invitation.replacedAt ?? now)
      );
    case 'expired':
      return err(invitationExpiredError(invitation.code, invitation.expiresAt));
    case 'accepted':
      return err(
        invitationAlreadyAcceptedError(
          invitation.code,
          invitation.acceptedAt ?? now
        )
      );
    case 'pending':
      break;
  }

  if (invitation.role === 'owner') {
    const expectedEmail = invitation.email;
    if (expectedEmail === null || !emailsMatch(expectedEmail, command.account.email)) {
      return err(
        ownerInviteEmailMismatchError(invitation.code, expectedEmail ?? '')
      );
    }

    if (ownerOf(members)) {
      return err(workspaceAlreadyHasOwnerError(invitation.organizationId));
    }

    const existing =
      members.find((entry) => entry.userId === command.account.userId) ?? null;
    const accepted = markInvitationAccepted(invitation, {
      now,
      userId: command.account.userId,
    });
    const fromRole =
      existing === null ? null : existing.role === 'owner' ? null : existing.role;
    const membership: OrganizationMembership =
      existing === null
        ? {
            id: membershipId,
            userId: command.account.userId,
            organizationId: invitation.organizationId,
            role: 'owner',
            isPersonalOrg: false,
            joinedAt: now,
          }
        : { ...existing, role: 'owner' };
    const event: OwnerAssigned = {
      type: 'OwnerAssigned',
      id: eventId,
      organizationId: invitation.organizationId,
      userId: command.account.userId,
      fromRole,
      previousOwnerUserId: null,
      actor: { kind: 'self', userId: command.account.userId },
      occurredAt: now,
    };
    return ok({
      accepted,
      membership:
        existing === null
          ? { kind: 'add', membership }
          : { kind: 'promote', membership },
      event,
    });
  }

  const existing =
    members.find((entry) => entry.userId === command.account.userId) ?? null;
  if (existing) {
    return err(
      alreadyMemberOfOrgError(command.account.userId, invitation.organizationId)
    );
  }

  const accepted = markInvitationAccepted(invitation, {
    now,
    userId: command.account.userId,
  });
  return ok({
    accepted,
    membership: {
      kind: 'add',
      membership: {
        id: membershipId,
        userId: command.account.userId,
        organizationId: invitation.organizationId,
        role: invitation.role,
        isPersonalOrg: false,
        joinedAt: now,
      },
    },
    event: null,
  });
};
