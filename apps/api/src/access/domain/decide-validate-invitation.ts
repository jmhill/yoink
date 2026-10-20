import { err, ok, type Result } from 'neverthrow';
import { normalizeEmail } from '@yoink/api-contracts';
import type { Invitation } from './invitation.js';
import { invitationStatus } from './invitation.js';
import {
  invitationAlreadyAcceptedError,
  invitationExpiredError,
  invitationNotFoundError,
  invitationReplacedError,
  ownerInviteEmailMismatchError,
  type InvitationAlreadyAcceptedError,
  type InvitationEmailMismatchError,
  type InvitationExpiredError,
  type InvitationNotFoundError,
  type InvitationReplacedError,
} from './invitation-errors.js';

export type ValidateInvitation = {
  code: string;
  email?: string;
};

export type ValidateInvitationError =
  | InvitationNotFoundError
  | InvitationReplacedError
  | InvitationExpiredError
  | InvitationAlreadyAcceptedError
  | InvitationEmailMismatchError;

export type DecideValidateInvitationInput = {
  query: ValidateInvitation;
  invitation: Invitation | null;
  now: string;
};

const emailsMatch = (expected: string, actual: string): boolean =>
  normalizeEmail(expected) === normalizeEmail(actual);

export const decideValidateInvitation = ({
  query,
  invitation,
  now,
}: DecideValidateInvitationInput): Result<Invitation, ValidateInvitationError> => {
  if (!invitation) {
    return err(invitationNotFoundError({ code: query.code }));
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

  if (
    invitation.email !== null &&
    query.email !== undefined &&
    !emailsMatch(invitation.email, query.email)
  ) {
    return err(ownerInviteEmailMismatchError(invitation.code, invitation.email));
  }

  return ok(invitation);
};
