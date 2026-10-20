import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import type { InvitationStore } from '../domain/invitation-store.js';
import type { Invitation } from '../domain/invitation.js';
import {
  decideValidateInvitation,
  type ValidateInvitation,
  type ValidateInvitationError,
} from '../domain/decide-validate-invitation.js';
import type { InvitationStorageError } from '../domain/invitation-errors.js';

export type HandleValidateInvitationDeps = {
  invitationStore: InvitationStore;
  now: () => string;
};

export type HandleValidateInvitationError =
  | ValidateInvitationError
  | InvitationStorageError;

export const handleValidateInvitation = (
  query: ValidateInvitation,
  deps: HandleValidateInvitationDeps
): ResultAsync<Invitation, HandleValidateInvitationError> => {
  return deps.invitationStore.findByCode(query.code).andThen((invitation) => {
    const decision = decideValidateInvitation({
      query,
      invitation,
      now: deps.now(),
    });
    return decision.isOk() ? okAsync(decision.value) : errAsync(decision.error);
  });
};
